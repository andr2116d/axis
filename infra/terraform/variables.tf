variable "region" {
  description = "Región de AWS donde viven ECR y Lambda (CloudFront es global)."
  type        = string
  default     = "us-east-1"
}

variable "nombre" {
  description = "Prefijo de los recursos (repositorio ECR, función Lambda, rol IAM)."
  type        = string
  default     = "axis"
}

variable "imagen_tag" {
  description = "Etiqueta de la imagen en ECR que ejecuta Lambda. infra/desplegar.sh la pasa en cada despliegue."
  type        = string
  default     = "latest"
}

variable "memoria_mb" {
  description = "Memoria de Lambda en MB. Más memoria también da más CPU: el análisis carga ~26 MB de datos reales."
  type        = number
  default     = 2048
}

variable "timeout_s" {
  description = "Tiempo máximo por petición. CloudFront corta a los 30 s, así que no tiene sentido subirlo más."
  type        = number
  default     = 30
}

variable "concurrencia_reservada" {
  description = "Tope de instancias simultáneas de Lambda (limita costos). null = sin tope; las cuentas nuevas no siempre permiten reservar."
  type        = number
  default     = null
}

variable "clase_precio" {
  description = "PriceClass de CloudFront. PriceClass_All incluye los nodos de Sudamérica (Lima, Bogotá, São Paulo)."
  type        = string
  default     = "PriceClass_All"
}

variable "retencion_logs_dias" {
  description = "Días que se guardan los logs de Lambda en CloudWatch."
  type        = number
  default     = 14
}
