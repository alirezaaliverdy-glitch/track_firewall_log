FROM node:22-alpine AS fetch
COPY fetch-sdk.mjs /fetch-sdk.mjs
RUN node /fetch-sdk.mjs
FROM debian:12-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=fetch /sdk /sdk
COPY replay.cpp /replay.cpp
RUN g++ -DLINUX -DLINUX64 -I/sdk -O2 /replay.cpp -Wl,--start-group /sdk/libNetSDK.a /sdk/libBasic.a /sdk/libTPLayer.a /sdk/libStreamParaser.a -Wl,--end-group -pthread -ldl -static -o /taoshi-replay
FROM debian:12-slim
COPY --from=build /taoshi-replay /usr/local/bin/taoshi-replay
USER 65534:65534
ENTRYPOINT ["/usr/local/bin/taoshi-replay"]
