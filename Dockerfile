FROM node:alpine3.15

WORKDIR /app
COPY . /app

RUN npm i
CMD npm run server