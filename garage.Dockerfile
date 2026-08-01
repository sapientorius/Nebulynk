ARG GARAGE_IMAGE=dxflrs/garage:v2.3.0
FROM ${GARAGE_IMAGE}

COPY garage.toml /etc/garage.toml

USER 65532:65532
