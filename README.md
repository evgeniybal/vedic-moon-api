# Vedic Moon API

A RESTful API that provides Vedic lunar calculations including:
- Moon's sidereal longitude (Lahiri ayanamsha)
- Current rashi (zodiac sign) 
- Current nakshatra and pada
- Current tithi (lunar day)
- Next ingress times for rashi and nakshatra

## Live Demo
🌙 **API Endpoint**: `https://vedic-moon-api.onrender.com`

## Usage

### Get Current Moon Data
```bash
GET /moon
```

### Get Moon Data for Specific Time
```bash
GET /moon?iso=2025-08-08T12:00:00Z
```

### API Documentation
Visit `/docs` for interactive OpenAPI documentation powered by Scalar.

## Example Response
```json
{
  "input": { "iso": "2025-08-08T12:00:00.000Z" },
  "moon": {
    "siderealLongitudeDeg": 127.456789,
    "rashi": { "index": 4, "name": "Simha", "degreesInSign": 7.4568 },
    "nakshatra": { "index": 9, "name": "Magha", "pada": 2, "degreesIntoNakshatra": 7.4568 },
    "tithi": { "number": 12, "paksha": "Shukla", "elongDeg": 132.45 }
  },
  "nextIngress": {
    "rashi": { "when": "2025-08-10T14:30:00.000Z", "rashiIndex": 5, "rashiName": "Kanya" },
    "nakshatra": { "when": "2025-08-09T08:15:00.000Z", "nakshatraIndex": 10, "nakshatraName": "Purva Phalguni" }
  }
}
```

## Local Development
```bash
npm install
npm run dev  # Uses nodemon for hot reload
# or
npm start    # Production mode
```

## Tech Stack
- Node.js + Express
- astronomy-engine for precise calculations
- Scalar for API documentation
- Approximate Lahiri ayanamsha (accurate to ~1 arcminute)

## Deployment
Deployed on Render.com free tier. The API automatically restarts if idle for 15+ minutes on the free plan.
