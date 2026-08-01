ARG LIVEKIT_SERVER_IMAGE=livekit/livekit-server:v1.13.4
FROM ${LIVEKIT_SERVER_IMAGE}

COPY livekit.yaml /livekit.yaml

USER 65532:65532
