const AWS = require('aws-sdk');

// Cấu hình DynamoDB Local (hoặc Remote)
AWS.config.update({
    region: "us-east-1", // Thay bằng region của bạn
    accessKeyId: "qgtq6p6", // Thay bằng Access Key của bạn
    secretAccessKey: "mve7wd",
    endpoint: "http://localhost:8000" // Nếu dùng DynamoDB Local
    // endpoint: undefined // Nếu dùng AWS DynamoDB trên cloud
});

// Khởi tạo DynamoDB Document Client
const dynamoClient = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME_Order = "Orders";
const TABLE_NAME_Product = "Products";

// Hàm để lấy dữ liệu từ bảng
const getProducts = async () => {
    const params = {
        TableName: TABLE_NAME_Product,
    };

    try {
        const data = await dynamoClient.scan(params).promise();
        return data.Items;
    } catch (err) {
        console.error("Unable to scan table. Error JSON:", JSON.stringify(err, null, 2));
    }
};

// Export module
module.exports = { getProducts };
