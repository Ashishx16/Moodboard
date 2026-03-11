const https = require("https");

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// Upgrade any Pinterest image URL to the highest available resolution (1200x)
function upgradeToHighestRes(url) {
  return url.replace(/\/\d+x\//, "/1200x/");
}

// Extract unique image ID for deduplication across different size variants
function getImageBase(url) {
  const match = url.match(/\/([a-f0-9]+)\.(jpg|jpeg|png|webp)$/i);
  return match ? match[1] : url;
}

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const boardUrl = event.queryStringParameters && event.queryStringParameters.board;

  if (!boardUrl || !boardUrl.includes("pinterest.com")) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing or invalid Pinterest board URL" }),
    };
  }

  try {
    const html = await fetchUrl(boardUrl);

    const seenBases = new Set();
    const images = [];

    const matches = [...html.matchAll(/https:\/\/i\.pinimg\.com\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp)/gi)];

    for (const m of matches) {
      const original = m[0];
      const base = getImageBase(original);
      if (seenBases.has(base)) continue;
      seenBases.add(base);
      images.push(upgradeToHighestRes(original));
    }

    if (images.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ images: [], note: "No images found. Make sure the board is public." }),
      };
    }

    // Shuffle
    for (let i = images.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [images[i], images[j]] = [images[j], images[i]];
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ images, total: images.length }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
