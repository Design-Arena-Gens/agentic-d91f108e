import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
];

export default config;
