output "url" {
  description = "Enlace público de Axis en AWS."
  value       = "https://${aws_cloudfront_distribution.axis.domain_name}"
}

output "dominio" {
  description = "Dominio de CloudFront (se pasa como AXIS_DOMINIO al compilar la imagen)."
  value       = aws_cloudfront_distribution.axis.domain_name
}

output "repositorio_ecr" {
  description = "Repositorio donde se suben las imágenes."
  value       = aws_ecr_repository.axis.repository_url
}

output "url_lambda" {
  description = "URL directa de la función (sin CloudFront), útil para depurar."
  value       = aws_lambda_function_url.axis.function_url
}
