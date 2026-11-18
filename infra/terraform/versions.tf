terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Estado local por defecto (infra/terraform/terraform.tfstate, fuera de git).
  # Para compartirlo con el equipo, crear un bucket S3 y descomentar:
  # backend "s3" {
  #   bucket       = "axis-terraform-estado"
  #   key          = "axis/terraform.tfstate"
  #   region       = "us-east-1"
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Proyecto      = "axis"
      GestionadoPor = "terraform"
    }
  }
}
