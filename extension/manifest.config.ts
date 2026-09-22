{
  "manifest_version": 3,
  "name": "Auto Listing AI",
  "version": "1.0.0",
  "description": "AI powered e-commerce listing automation",
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "tabs",
    "sidePanel"
  ],
  "host_permissions": [
    "https://*.meesho.com/*",
    "https://*.amazon.in/*",
    "https://*.amazon.com/*",
    "https://*.flipkart.com/*"
  ],
  "action": {
    "default_title": "Auto Listing AI"
  },
  "side_panel": {
    "default_path": "index.html"
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://*.meesho.com/*",
        "https://*.amazon.in/*",
        "https://*.amazon.com/*",
        "https://*.flipkart.com/*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}