FROM apify/actor-node-playwright-chrome:20

# Copy only package files first (for caching)
COPY package*.json ./

# Copy all project files including scripts
COPY . ./

# Install dependencies (postinstall can run now)
RUN npm install --include=dev --audit=false

# Build (if your package.json has build:ci)
RUN npm run build:ci

# Remove dev dependencies for smaller image
RUN npm prune --production

# Start the actor
CMD ["npm", "start"]

