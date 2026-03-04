CREATE TABLE rejected_ads (
    id SERIAL PRIMARY KEY,
    platform TEXT NOT NULL,
    image_url TEXT,
    headline TEXT,
    description TEXT,
    cta TEXT,
    verdict TEXT,
    violations TEXT[],
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT now()
);
