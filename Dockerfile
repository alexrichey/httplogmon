FROM node:11
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN touch /var/log/access.log
CMD [ "node", "index.js" ]
