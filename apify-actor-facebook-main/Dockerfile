FROM apify/actor-node-playwright-chrome:20

# Copy package files first
COPY package*.json ./

# Copy scripts folder so postinstall can see it
COPY scripts ./scripts

# Install npm dependencies (postinstall will run here)
RUN npm install --include=dev --audit=false

# Copy everything else
COPY . ./

# Build the project (skip if you don't have this script)
RUN npm run build:ci || echo "No build:ci script, skipping"

# Remove dev dependencies for production
RUN npm prune --production

# Start the actor
CMD npm start


