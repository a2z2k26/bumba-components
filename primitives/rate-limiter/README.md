# @bumba/rate-limiter

Intelligent API rate limiting with token bucket algorithm and automatic backoff.

## Installation

```bash
npm install @bumba/rate-limiter
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { RateLimiter } = require('@bumba/rate-limiter');

const limiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000  // 100 requests per minute
});

// Check before making API call
if (await limiter.canProceed()) {
  await makeApiCall();
} else {
  const waitTime = limiter.getWaitTime();
  console.log(`Rate limited. Wait ${waitTime}ms`);
}
```

## Features

- **Token Bucket Algorithm**: Smooth rate limiting
- **Automatic Backoff**: Exponential retry delays
- **Multiple Tiers**: Different limits per endpoint
- **Quota Tracking**: Monitor usage against limits

## API

### `RateLimiter`

```javascript
const limiter = new RateLimiter(options);
```

**Options:**
- `maxRequests` (number): Maximum requests per window
- `windowMs` (number): Time window in milliseconds

**Methods:**
- `canProceed()`: Check if request can proceed
- `getWaitTime()`: Get time until next available slot
- `reset()`: Reset the limiter

## Dependencies

- `@bumba/shared` - Shared utilities (logger, events)

## License

MIT
