FROM apify/actor-node-playwright-chrome:20
COPY package*.json ./
COPY scripts ./scripts
RUN npm install --include=dev --audit=false
COPY . ./
RUN npm run build:ci
RUN npm prune --production
CMD npm start
