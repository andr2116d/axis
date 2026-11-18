# Axis en AWS (infraestructura como código)

Alternativa al despliegue en Vercel para redes cuyo proxy bloquea `*.vercel.app`.
Vercel sigue siendo el despliegue principal; esto queda listo para usarse cuando haga falta.

```
navegador ──HTTPS──▶ CloudFront (xxxx.cloudfront.net)
                        │  /_next/static/*  → caché en el borde
                        │  todo lo demás    → sin caché
                        ▼
                 URL de función Lambda
                        ▼
      Lambda (contenedor arm64: Next.js standalone + Lambda Web Adapter)
                        ▲
                  imagen en ECR
```

| Archivo | Qué hace |
|---|---|
| `../Dockerfile` | Compila Next en modo `standalone` e incluye `src/data` (datos reales que leen las API). |
| `terraform/` | ECR, rol IAM, Lambda, URL de función, CloudFront y logs. |
| `desplegar.sh` | Crea ECR, compila y sube la imagen, aplica Terraform y recompila con el dominio final. |
| `destruir.sh` | Borra todo lo creado. |

## Requisitos

- AWS CLI con sesión activa: `aws login` (o `aws sso login`).
- Terraform ≥ 1.6 y Docker en ejecución.
- Permisos en la cuenta para ECR, Lambda, IAM, CloudFront y CloudWatch Logs.

## Desplegar

```bash
cd huaca
infra/desplegar.sh             # pide confirmación en cada terraform apply
AUTO=1 infra/desplegar.sh      # sin confirmaciones
AWS_REGION=sa-east-1 infra/desplegar.sh   # otra región
```

Al final imprime la URL (`https://xxxx.cloudfront.net`). La primera vez CloudFront tarda unos minutos.
Para publicar cambios basta con volver a correr `infra/desplegar.sh`.

## Probar la imagen en local (sin AWS)

```bash
docker build -t axis-local .
docker run --rm -p 8080:8080 axis-local   # http://localhost:8080
```

## Costos y límites

- Con poco tráfico (demo, jurado) entra en la capa gratuita de Lambda y CloudFront; ECR cobra ~US$0.10/GB-mes por las imágenes (se guardan las 5 últimas).
- **Arranque en frío:** tras unos minutos sin visitas, la primera petición tarda 2–5 s. Antes de una presentación, abrir la URL una vez.
- Las peticiones a Lambda admiten hasta 6 MB de cuerpo y 30 s de respuesta (límite de CloudFront).
- `concurrencia_reservada` en `terraform.tfvars` pone un tope de instancias si se quiere limitar gastos.

## Notas

- El estado de Terraform queda en `infra/terraform/terraform.tfstate` (fuera de git). Para compartirlo, usar el backend S3 comentado en `versions.tf`.
- `next.config.mjs` solo activa `output: 'standalone'` cuando `AXIS_STANDALONE=1` (lo fija el Dockerfile), así que Vercel compila igual que antes.
- `AXIS_DOMINIO` hace que los metadatos y Open Graph apunten al dominio de CloudFront en vez de `localhost`.
- Dominio propio: se puede añadir un certificado ACM (en us-east-1) y `aliases` en la distribución.
