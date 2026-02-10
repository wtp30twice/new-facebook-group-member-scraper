FROM apify/actor-node-playwright-chrome:20
COPY package*.json ./
RUN npm install --include=dev --audit=false
COPY . ./
RUN npm run build:ci
RUN npm prune --production
CMD npm start
