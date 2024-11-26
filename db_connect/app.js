const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid'); // Để tạo user_id duy nhất
const bcrypt = require('bcrypt'); // Để mã hóa mật khẩu
const validator = require('validator');

// Cấu hình DynamoDB
AWS.config.update({
    region: "us-east-1", // Thay đổi theo vùng của bạn
    accessKeyId: "qgtq6p6", // Thay bằng Access Key của bạn
    secretAccessKey: "mve7wd",
    endpoint: "http://localhost:8000" // Nếu bạn dùng DynamoDB local, còn nếu là trên AWS thì không cần endpoint
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME_Product = 'Products';
const TABLE_NAME_Carts = 'Carts';
const TABLE_NAME_Users = 'Users';
const TABLE_NAME_Orders = 'Orders';
const TABLE_NAME_OrderCounter = 'OrderCounter';

const app = express();
const PORT = 3000;

// Sử dụng express.json() để phân tích cú pháp dữ liệu JSON trong body
app.use(express.json());  // Thêm dòng này

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT'],
}));

// Route GET / (Trang chủ)
app.get('/', (req, res) => {
    res.send('<h1>Chào mừng bạn đến với Chỉ May Đại Lợi</h1>');
});
//==========================================================================================================================================
// API Đăng ký user
app.post('/users/register', async (req, res) => {
    const { email, phone, password } = req.body;

    // Kiểm tra thông tin đầu vào
    if (!email || !phone || !password) {
        return res.status(400).send('Thiếu thông tin yêu cầu.');
    }

    try {
        // Kiểm tra xem email đã tồn tại chưa trong bảng chính
        const emailCheckParams = {
            TableName: TABLE_NAME_Users,
            KeyConditionExpression: 'email = :email',  // Kiểm tra chỉ với email
            ExpressionAttributeValues: {
                ':email': email,
            },
        };

        const emailCheck = await dynamoClient.query(emailCheckParams).promise();

        // Nếu email đã tồn tại, trả về lỗi
        if (emailCheck.Items.length > 0) {
            return res.status(400).send('Email đã được sử dụng.');
        }

        // Kiểm tra xem số điện thoại đã tồn tại chưa trong bảng chính
        const phoneCheckParams = {
            TableName: TABLE_NAME_Users,
            KeyConditionExpression: 'email = :email AND phone = :phone', // Kiểm tra cả email và phone
            ExpressionAttributeValues: {
                ':email': email,
                ':phone': phone,
            },
        };

        const phoneCheck = await dynamoClient.query(phoneCheckParams).promise();

        // Nếu số điện thoại đã tồn tại, trả về lỗi
        if (phoneCheck.Items.length > 0) {
            return res.status(400).send('Số điện thoại đã được sử dụng.');
        }

        // Tạo người dùng mới
        const user = {
            email,    // Partition key của bảng chính
            phone,    // Sort key của bảng chính
            password, // Trường password lưu trực tiếp (chưa mã hóa)
        };

        // Thêm người dùng vào bảng
        const putParams = {
            TableName: TABLE_NAME_Users,
            Item: user,
        };

        await dynamoClient.put(putParams).promise();

        res.status(201).json({ message: 'Đăng ký thành công!' });
    } catch (error) {
        console.error('Lỗi khi đăng ký:', error);
        res.status(500).send('Đã xảy ra lỗi khi đăng ký.');
    }
});
//=============================================================================================================================================

//=============================================================================================================================================
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Kiểm tra thông tin đầu vào
    if (!email || !password) {
        return res.status(400).json({ message: 'Thiếu thông tin yêu cầu.' });
    }

    const params = {
        TableName: TABLE_NAME_Users,
        KeyConditionExpression: 'email = :email',  // Kiểm tra bằng email (partition key)
        ExpressionAttributeValues: {
            ':email': email,
        },
    };

    try {
        const result = await dynamoClient.query(params).promise();

        if (result.Items.length === 0) {
            console.error(`Không tìm thấy người dùng với email: ${email}`);
            return res.status(400).json({ message: 'Tên người dùng không tồn tại.' });
        }

        const user = result.Items[0];

        // Kiểm tra mật khẩu
        if (user.password !== password) {
            console.error(`Mật khẩu không khớp: Nhập: ${password}, DB: ${user.password}`);
            return res.status(400).json({ message: 'Mật khẩu không chính xác.' });
        }

        // Nếu đăng nhập thành công
        console.log(`Đăng nhập thành công cho user: ${user.email}`);
        return res.status(200).json({ message: 'Đăng nhập thành công!' });

    } catch (error) {
        console.error('Lỗi khi xử lý đăng nhập:', error);
        return res.status(500).json({ message: 'Đã xảy ra lỗi khi đăng nhập.' });
    }
});
//=============================================================================================================================================

//=============================================================================================================================================
// Route GET /products - Lấy danh sách sản phẩm
app.get('/products', async (req, res) => {
    const params = {
        TableName: TABLE_NAME_Product
    };

    try {
        const data = await dynamoClient.scan(params).promise();
        if (data.Items.length === 0) {
            return res.status(200).send("Hiện chưa có sản phẩm nào.");
        }
        res.json(data.Items); // Trả về danh sách sản phẩm dưới dạng JSON
    } catch (err) {
        console.error("Lỗi khi lấy sản phẩm:", err);
        res.status(500).send("Lỗi khi lấy sản phẩm");
    }
});
//============================================================================================================================================

//=============================================================================================================================================
// Tăng order_value trong OrderCounter và tạo order_id
async function getNextOrderId() {
    const params = {
        TableName: TABLE_NAME_OrderCounter,
        Key: { order_id: 'ORDER_COUNTER' }, // order_id cố định cho bảng đếm
        UpdateExpression: 'SET order_value = order_value + :increment',
        ExpressionAttributeValues: { ':increment': 1 },
        ReturnValues: 'UPDATED_NEW', // Trả về giá trị mới sau khi cập nhật
    };

    try {
        const result = await dynamoClient.update(params).promise();
        const orderValue = result.Attributes.order_value; // Lấy giá trị mới nhất của order_value
        return `ORD_${orderValue.toString().padStart(2, '0')}`; // Tạo order_id với định dạng ORD_XX
    } catch (error) {
        console.error('Error generating next order_id:', error);
        throw new Error('Could not generate next order_id');
    }
}

// API thanh toán với lưu vào bảng Orders
app.post('/checkout', async (req, res) => {
    const { user_email, cartItems, paymentMethod } = req.body;

    if (!user_email || !cartItems || cartItems.length === 0 || !paymentMethod) {
        return res.status(400).json({ error: 'Invalid request data' });
    }

    try {
        // Tạo order_id mới
        const order_id = await getNextOrderId();

        // Lưu đơn hàng vào bảng Orders
        const orderParams = {
            TableName: TABLE_NAME_Orders,
            Item: {
                order_id,       // Partition Key
                email: user_email, // Sort Key
                cartItems,      // Lưu danh sách sản phẩm trong giỏ hàng
                paymentMethod,  // CASH hoặc ONLINE
                createdAt: new Date().toISOString(),
                status: paymentMethod === 'CASH' ? 'Pending Payment' : 'Paid', // Trạng thái thanh toán
            },
        };

        await dynamoClient.put(orderParams).promise();

        res.status(201).json({ message: 'Order created successfully', order_id });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Could not create order' });
    }
});


//============================================================================================================================

//=============================================================================================================================

//===============================================================================================================================


//================================================================ Khởi động server==============================================
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
//===============================================================================================================================
