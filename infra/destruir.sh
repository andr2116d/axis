#!/usr/bin/env bash
# Elimina toda la infraestructura de Axis en AWS (ECR con sus imágenes, Lambda, CloudFront, IAM y logs).
set -euo pipefail
TF="$(cd "$(dirname "$0")" && pwd)/terraform"
terraform -chdir="$TF" destroy -input=false -var "region=${AWS_REGION:-us-east-1}"
