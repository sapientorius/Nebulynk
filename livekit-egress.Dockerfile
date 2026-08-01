ARG LIVEKIT_EGRESS_IMAGE=livekit/egress:v1.13.0
FROM ${LIVEKIT_EGRESS_IMAGE}

COPY livekit-egress.yaml /livekit-egress.yaml
