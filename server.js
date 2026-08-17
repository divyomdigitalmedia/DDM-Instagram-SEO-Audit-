require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = Number(process.env.PORT || 10000);
const CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
const CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "/";

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.warn("Missing Instagram environment variables. OAuth will not work until they are set.");
}

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(express.static(path.join(__dirname, "public")));

const auditStore = new Map();

function cleanUsername(value) {
  let username = String(value || "").trim();
  username = username.replace(/^@/, "");

  const match = username.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i
  );

  if (match) username = match[1];

  username = username.split("?")[0];
  username = username.split("#")[0];
  username = username.replace(/\/+$/, "");
  username = username.replace(/^@/, "");

  return username.trim().toLowerCase();
}

function calculateAudit(profile) {
  const name = String(profile.name || "").trim();
  const bio = String(profile.biography || "").trim();
  const username = String(profile.username || "").trim();
  const followers = Number(profile.followers_count || 0);
  const following = Number(profile.follows_count || 0);
  const posts = Number(profile.media_count || 0);

  const strengths = [];
  const opportunities = [];

  // Profile SEO
  let profileSEO = 45;

  if (name) {
    profileSEO += 20;
    strengths.push("A public profile name is available.");
  } else {
    opportunities.push("Add a clear searchable profile name related to your niche.");
  }

  if (username.length >= 3 && username.length <= 30) {
    profileSEO += 10;
    strengths.push("Username has a practical length for branding.");
  }

  if (bio.length >= 40) {
    profileSEO += 15;
    strengths.push("Bio contains a useful amount of descriptive information.");
  } else {
    opportunities.push("Expand the bio with your niche, value proposition and a clear action.");
  }

  // Keyword SEO
  const words = bio
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);

  const uniqueWords = [...new Set(words)];
  let keywordSEO = Math.min(95, 35 + uniqueWords.length * 4);

  if (uniqueWords.length >= 8) {
    strengths.push("Bio contains multiple descriptive keyword signals.");
  } else {
    opportunities.push("Add more specific niche keywords to the Instagram bio.");
  }

  // Content SEO
  let contentSEO = 30;

  if (posts >= 5) {
    contentSEO += 25;
    strengths.push("Profile has a developing content library.");
  } else {
    opportunities.push("Build a consistent public content library around your core niche.");
  }

  if (posts >= 20) contentSEO += 20;
  if (posts >= 50) contentSEO += 15;

  // Discoverability
  let discoverabilitySEO = 50;

  if (name) discoverabilitySEO += 10;
  if (bio.length >= 60) discoverabilitySEO += 10;

  opportunities.push("Add a location signal when local customers are important.");
  opportunities.push("Use consistent niche language across profile and content.");

  if (followers >= 10000) {
    discoverabilitySEO += 20;
    strengths.push("Profile has a substantial public follower base.");
  } else if (followers >= 1000) {
    discoverabilitySEO += 10;
  }

  profileSEO = Math.min(100, profileSEO);
  keywordSEO = Math.min(100, keywordSEO);
  contentSEO = Math.min(100, contentSEO);
  discoverabilitySEO = Math.min(100, discoverabilitySEO);

  const score = Math.round(
    (profileSEO + keywordSEO + contentSEO + discoverabilitySEO) / 4
  );

  return {
    score,
    status:
      score < 55
        ? "Needs Significant Optimization"
        : score < 70
          ? "Good Foundation — Needs Improvement"
          : score < 82
            ? "Strong Foundation"
            : "Very Strong Preliminary Score",
    categories: {
      profileSEO,
      keywordSEO,
      contentSEO,
      discoverabilitySEO
    },
    strengths: [...new Set(strengths)].slice(0, 6),
    opportunities: [...new Set(opportunities)].slice(0, 6)
  };
}

async function instagramTokenRequest(code) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    code
  });

  const response = await fetch(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }
  );

  const data = await response.json();

  if (!response.ok || data.error_type || data.error_message) {
    throw new Error(
      data.error_message ||
      data.error_description ||
      "Instagram authorization failed."
    );
  }

  return data;
}

async function getInstagramProfile(accessToken) {
  const fields = [
    "user_id",
    "username",
    "name",
    "biography",
    "profile_picture_url",
    "followers_count",
    "follows_count",
    "media_count"
  ].join(",");

  const url =
    "https://graph.instagram.com/me?fields=" +
    encodeURIComponent(fields) +
    "&access_token=" +
    encodeURIComponent(accessToken);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error?.message ||
      "Instagram profile data could not be loaded."
    );
  }

  return data;
}

async function getLongLivedToken(shortToken) {
  const url =
    "https://graph.instagram.com/access_token" +
    "?grant_type=ig_exchange_token" +
    "&client_secret=" +
    encodeURIComponent(CLIENT_SECRET) +
    "&access_token=" +
    encodeURIComponent(shortToken);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    // A successful short-lived login is still usable for the initial audit.
    return shortToken;
  }

  return data.access_token || shortToken;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "DDM Instagram SEO Audit",
    instagramConfigured: Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI)
  });
});

app.get("/auth/instagram", (req, res) => {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).send("Instagram OAuth is not configured on the server.");
  }

  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    force_reauth: "true",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "instagram_business_basic",
    state
  });

  console.log("INSTAGRAM CLIENT ID:", CLIENT_ID);
  console.log("INSTAGRAM REDIRECT URI:", REDIRECT_URI);

  res.redirect(
    "https://www.instagram.com/oauth/authorize?" + params.toString()
  );
});

app.get("/auth/instagram/callback", async (req, res) => {
  console.log("=== INSTAGRAM CALLBACK HIT ===");
  console.log("Callback query:", req.query);
  console.log("code:", req.query.code ? "RECEIVED" : "MISSING");
  console.log("state:", req.query.state ? "RECEIVED" : "MISSING");
  
  try {
    const { code, state, error, error_reason } = req.query;

    if (error) {
      return res.redirect(
        PUBLIC_BASE_URL +
        "?instagram_error=" +
        encodeURIComponent(error_reason || error)
      );
    }

    if (!code) {
      return res.status(400).send("Instagram did not return an authorization code.");
    }

    if (!state || state !== req.session.oauthState) {
      return res.status(400).send("Invalid OAuth state. Please try connecting again.");
    }

    delete req.session.oauthState;

    const tokenData = await instagramTokenRequest(code);
    const accessToken = await getLongLivedToken(tokenData.access_token);
    const profile = await getInstagramProfile(accessToken);

    const audit = calculateAudit(profile);

    // Token remains server-side only.
    req.session.instagram = {
      userId: profile.user_id,
      username: profile.username,
      accessToken
    };

    const auditId = crypto.randomUUID();

    auditStore.set(auditId, {
      profile: {
        user_id: profile.user_id,
        username: profile.username || "",
        name: profile.name || "",
        biography: profile.biography || "",
        profile_picture_url: profile.profile_picture_url || "",
        followers_count: Number(profile.followers_count || 0),
        follows_count: Number(profile.follows_count || 0),
        media_count: Number(profile.media_count || 0)
      },
      audit,
      createdAt: Date.now()
    });

    // Keep only a temporary server-side audit.
    setTimeout(() => auditStore.delete(auditId), 1000 * 60 * 30);

    res.redirect(
      PUBLIC_BASE_URL +
      "?instagram_connected=true&audit_id=" +
      encodeURIComponent(auditId)
    );
  } catch (error) {
    console.error("Instagram callback error:", error);

    res.redirect(
      PUBLIC_BASE_URL +
      "?instagram_error=" +
      encodeURIComponent(error.message || "Instagram connection failed.")
    );
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session.instagram) {
    return res.json({ connected: false });
  }

  res.json({
    connected: true,
    username: req.session.instagram.username,
    userId: req.session.instagram.userId
  });
});

app.get("/api/free-audit/:auditId", (req, res) => {
  const record = auditStore.get(req.params.auditId);

  if (!record) {
    return res.status(404).json({
      success: false,
      message: "This audit session has expired. Please connect Instagram again."
    });
  }

  res.json({
    success: true,
    auditType: "free",
    profile: record.profile,
    score: record.audit.score,
    status: record.audit.status,
    categories: record.audit.categories,
    strengths: record.audit.strengths,
    opportunities: record.audit.opportunities,
    notice:
      "This is an independent preliminary Instagram SEO assessment and is not an official Instagram or Meta ranking score."
  });
});

app.post("/api/audit", (req, res) => {
  const requested = cleanUsername(req.body?.username);
  const connected = cleanUsername(req.session.instagram?.username);

  if (!req.session.instagram) {
    return res.status(401).json({
      success: false,
      code: "INSTAGRAM_NOT_CONNECTED",
      message:
        "Connect your Professional Instagram account first. The official Instagram API does not provide arbitrary public-profile lookup by username."
    });
  }

  if (requested && requested !== connected) {
    return res.status(403).json({
      success: false,
      code: "USERNAME_MISMATCH",
      message:
        "The entered username does not match the Instagram account currently connected."
    });
  }

  return res.status(400).json({
    success: false,
    message: "Use the connected Instagram account to generate the preliminary audit."
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`DDM Instagram SEO Audit running on port ${PORT}`);
});
