FROM apify/actor-node-playwright-chrome:20

# Copy package files
COPY package*.json ./

# COPY SCRIPTS FIRST (THIS IS THE FIX)
COPY scripts ./scripts

# Now install (postinstall can see the script)
RUN npm install --include=dev --audit=false

# Copy rest of project
COPY . ./

RUN npm run build:ci || echo "skip build"
RUN npm prune --production

CMD npm start

