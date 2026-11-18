# Axis en AWS: imagen Docker en ECR → Lambda (con Lambda Web Adapter) → URL de función → CloudFront (HTTPS).

# ---------- Registro de imágenes ----------

resource "aws_ecr_repository" "axis" {
  name                 = var.nombre
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "axis" {
  repository = aws_ecr_repository.axis.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Conservar solo las 5 imágenes más recientes"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

# ---------- Lambda ----------

data "aws_iam_policy_document" "asumir_lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.nombre}-lambda"
  assume_role_policy = data.aws_iam_policy_document.asumir_lambda.json
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.nombre}"
  retention_in_days = var.retencion_logs_dias
}

resource "aws_lambda_function" "axis" {
  function_name = var.nombre
  role          = aws_iam_role.lambda.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.axis.repository_url}:${var.imagen_tag}"
  architectures = ["arm64"]
  memory_size   = var.memoria_mb
  timeout       = var.timeout_s

  reserved_concurrent_executions = var.concurrencia_reservada == null ? -1 : var.concurrencia_reservada

  ephemeral_storage {
    size = 512
  }

  depends_on = [aws_iam_role_policy_attachment.logs, aws_cloudwatch_log_group.lambda]
}

resource "aws_lambda_function_url" "axis" {
  function_name      = aws_lambda_function.axis.function_name
  authorization_type = "NONE"
}

# URL pública: hacen falta ambos permisos (InvokeFunctionUrl y, desde oct. 2025, InvokeFunction vía URL).
resource "aws_lambda_permission" "url_publica" {
  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.axis.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "invocar_por_url" {
  statement_id             = "FunctionURLAllowInvokeAction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.axis.function_name
  principal                = "*"
  invoked_via_function_url = true
}

# ---------- CloudFront ----------

locals {
  origen_lambda = trimsuffix(trimprefix(aws_lambda_function_url.axis.function_url, "https://"), "/")

  # Políticas administradas por AWS
  cache_desactivada   = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  cache_optimizada    = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  todo_menos_host     = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
  cabeceras_seguridad = "67f7725c-6f97-4210-82d7-5512b31e9d03" # Managed-SecurityHeadersPolicy
}

resource "aws_cloudfront_distribution" "axis" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = var.clase_precio
  comment         = "Axis (Next.js en Lambda)"

  origin {
    origin_id   = "lambda"
    domain_name = local.origen_lambda

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 30
    }
  }

  # Páginas y API: sin caché; se reenvían query, cookies y cabeceras (menos Host, que debe ser el de la URL de Lambda).
  default_cache_behavior {
    target_origin_id           = "lambda"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_desactivada
    origin_request_policy_id   = local.todo_menos_host
    response_headers_policy_id = local.cabeceras_seguridad
  }

  # Archivos estáticos con hash de Next: se guardan en el borde.
  ordered_cache_behavior {
    path_pattern               = "/_next/static/*"
    target_origin_id           = "lambda"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_optimizada
    response_headers_policy_id = local.cabeceras_seguridad
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
