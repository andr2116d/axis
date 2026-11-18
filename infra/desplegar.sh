#!/usr/bin/env bash
# Despliega Axis en AWS: crea ECR, compila y sube la imagen, y aplica el resto de la infraestructura.
# Requisitos: aws CLI con sesión activa (aws login / aws sso login), terraform >= 1.6 y Docker.
# Uso: infra/desplegar.sh            (pide confirmación antes de cada terraform apply)
#      AUTO=1 infra/desplegar.sh     (sin confirmaciones)
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TF="$RAIZ/infra/terraform"
REGION="${AWS_REGION:-us-east-1}"
APROBAR=(); [[ "${AUTO:-0}" == "1" ]] && APROBAR=(-auto-approve)

tf() { terraform -chdir="$TF" "$@"; }

aws sts get-caller-identity >/dev/null || { echo "Sin sesión de AWS: ejecuta 'aws login' primero." >&2; exit 1; }

echo "==> 1/4 Terraform init y repositorio ECR"
tf init -input=false
tf apply -input=false -var "region=$REGION" -target=aws_ecr_repository.axis "${APROBAR[@]}"
REPO="$(tf output -raw repositorio_ecr)"
DOMINIO="$(tf output -raw dominio 2>/dev/null || true)"

construir_y_subir() { # $1 = dominio público (puede ir vacío en el primer despliegue)
  TAG="$(git -C "$RAIZ" rev-parse --short HEAD 2>/dev/null || echo local)-$(date +%Y%m%d%H%M%S)"
  echo "==> Imagen $REPO:$TAG (AXIS_DOMINIO=${1:-<pendiente>})"
  aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${REPO%%/*}"
  docker build --platform linux/arm64 --provenance=false --build-arg "AXIS_DOMINIO=$1" -t "$REPO:$TAG" "$RAIZ"
  docker push "$REPO:$TAG"
}

echo "==> 2/4 Compilar y subir la imagen"
construir_y_subir "$DOMINIO"

echo "==> 3/4 Lambda + CloudFront"
tf apply -input=false -var "region=$REGION" -var "imagen_tag=$TAG" "${APROBAR[@]}"

# Primer despliegue: el dominio de CloudFront recién existe; se recompila para que los metadatos lo usen.
NUEVO="$(tf output -raw dominio)"
if [[ "$NUEVO" != "$DOMINIO" ]]; then
  echo "==> 4/4 Recompilar con el dominio $NUEVO"
  construir_y_subir "$NUEVO"
  tf apply -input=false -var "region=$REGION" -var "imagen_tag=$TAG" "${APROBAR[@]}"
else
  echo "==> 4/4 Dominio sin cambios"
fi

echo
echo "Axis en AWS: $(tf output -raw url)"
echo "(CloudFront tarda unos minutos en propagarse la primera vez.)"
