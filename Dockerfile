# this aggregates the web and api into a single file
# to take advantage of docker cache

# build step
FROM node:20-alpine as build
RUN npm install -g @vercel/ncc@0.36.1
WORKDIR /app
COPY package.json yarn.lock ./
COPY api/package.json api/
COPY api/.env.sh api/
COPY web/package.json web/
COPY web/public/ web/public/

RUN yarn install --frozen-lockfile

COPY turbo.json ./
COPY api/ api/
COPY web/src/ web/src/
COPY web/config-overrides.js web/tsconfig.json web/
COPY web/.env web/

WORKDIR /app/web
RUN yarn prepare
RUN sed -i '/"homepage":/d' package.json

WORKDIR /app
RUN yarn build

WORKDIR /app/api
RUN rm -r src
RUN cp dist -r src/
RUN npx ncc build src/main.js

WORKDIR /app
COPY web/nginx.conf web/


# ----- api only ------
# to build only back run
# docker build . --target api --tag my-api-tag`
FROM node:20-alpine as api
RUN npm install -g forever@4.0.3
RUN apk add --no-cache \
  git \
  openssh-client \
  ca-certificates
COPY --from=build /app/api/dist/index.js .
# For reading the version number
COPY --from=build /app/package.json .
ENTRYPOINT sh -c "forever index.js"



## ----- web only ------
# to build only front run
# docker build . --target web --tag my-web-tag
FROM nginx:stable-alpine as web
RUN apk add --update nodejs npm
COPY --from=build /app/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/node_modules/cra-envs/package.json ./cra-envs-package.json
RUN npm i -g cra-envs@`node -e 'console.log(require("./cra-envs-package.json")["version"])'`
WORKDIR /usr/share/nginx
COPY --from=build /app/web/.env .
COPY --from=build /app/web/build ./html
ENTRYPOINT sh -c "npx embed-environnement-variables && nginx -g 'daemon off;'"
