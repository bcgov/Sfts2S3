FROM node:12-alpine

RUN apk update && apk add openjdk8-jre && mkdir -p /usr/src/app && chmod -R 0777 /usr/src/app
WORKDIR /usr/src/app
ARG NODE_ENV
ENV NODE_ENV $NODE_ENV
COPY . /usr/src/app
RUN rm -rf node_modules && npm install

CMD [ "npm", "start" ]