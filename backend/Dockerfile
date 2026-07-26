# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package.json, pnpm-lock.yaml and workspace configurations if any
COPY package.json pnpm-lock.yaml* ./

# Install all dependencies (including devDependencies) for building
RUN pnpm install --frozen-lockfile

# Copy the rest of the application source code
COPY . .

# Build the NestJS application
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Set environment to production
ENV NODE_ENV=production

# Copy package.json and lockfile
COPY package.json pnpm-lock.yaml* ./

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile

# Copy built application from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the application port
EXPOSE 4000

# Start the application
CMD ["node", "dist/main"]
