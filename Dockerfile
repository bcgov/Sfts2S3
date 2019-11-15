FROM node:12-alpine

# install openjdk8
RUN apk update
RUN apk fetch openjdk8
RUN apk add openjdk8

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

ARG NODE_ENV
ENV NODE_ENV $NODE_ENV
COPY . /usr/src/app
RUN rm -rf node_modules && npm install

CMD [ "npm", "start" ]