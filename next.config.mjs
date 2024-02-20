/** @type {import('next').NextConfig} */
const nextConfig = {
    distDir: "dist",
    transpilePackages: [
        "antd",
        "rc-util",
        "@babel/runtime",
        "@ant-design/icons",
        "@ant-design/icons-svg",
        "rc-pagination",
        "rc-picker",
        "rc-tree",
        "rc-table",
    ],
};

export default nextConfig;
