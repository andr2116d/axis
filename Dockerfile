# Imagen de Axis para AWS Lambda (ver infra/README.md).
# Next.js en modo standalone + Lambda Web Adapter: el servidor HTTP de Next corre tal cual dentro de Lambda.

FROM public.ecr.aws/docker/library/node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM public.ecr.aws/docker/library/node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dominio público (CloudFront) para las URL de metadatos y Open Graph; se fija al compilar.
ARG AXIS_DOMINIO=""
ENV AXIS_STANDALONE=1 AXIS_DOMINIO=$AXIS_DOMINIO NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM public.ecr.aws/docker/library/node:20-slim
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0 \
    AWS_LWA_PORT=8080 AWS_LWA_READINESS_CHECK_PATH=/
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Los datos reales se leen con fs desde process.cwd()/src/data.
COPY --from=build /app/src/data ./src/data
# Lambda solo permite escribir en /tmp: la caché de Next (imágenes optimizadas) va allí.
RUN ln -s /tmp/next-cache ./.next/cache
EXPOSE 8080
CMD ["sh", "-c", "mkdir -p /tmp/next-cache && exec node server.js"]
