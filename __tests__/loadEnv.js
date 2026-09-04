process.env.TZ = "Asia/Kolkata"
process.env.MOCK_ORDERS = "true"
process.env.SECRET_COOKIE_PASSWORD = "test-secret-cookie-password-min-32-chars"
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/trading_db"
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379"
process.env.KITE_API_KEY = process.env.KITE_API_KEY || "test_key"
process.env.KITE_API_SECRET = process.env.KITE_API_SECRET || "test_secret"
