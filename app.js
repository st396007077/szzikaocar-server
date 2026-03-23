const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// ====================== 核心配置 ======================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ====================== 学校价格配置（与前端的 SCHOOL_PRICE 保持一致） ======================
const SCHOOL_PRICE = {
  '绣水中学': 15,      // 绣水中学价格：15元
  '章丘实验小学': 15,      // 章丘实验小学价格：15元
  '章丘实验中学': 15,      // 章丘实验中学价格：15元
  '章丘第二实验中学': 15,  // 章丘第二实验中学价格：15元
  '章丘鲁能实验小学': 15,  // 章丘鲁能实验小学价格：15元
  '中等职业学校': 15,   // 中等职业学校价格：15元
  '济南六里山小学': 17,   // 济南六里山小学价格：17元
  '济南槐荫中学': 17,   // 济南槐荫中学价格：17元
  '济南育贤中学': 17,   // 济南育贤中学价格：17元
};

// ====================== MongoDB 模型定义 ======================
const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, required: true },
  userName: { type: String, required: true },
  userPhone: { type: String, required: true },
  total: { type: Number, required: true },
  carList: [{
    name: String,
    price: { type: Number, default: 0 },
    school: String,
    from: String,
    to: String
  }],
  payType: { type: String, required: true },
  createTime: { type: String, required: true },
  payScreenshots: [{ type: String }],
  paymentRecords: [{
    payType: String,
    amount: Number,
    time: String
  }],
  isManuallyModified: { type: Boolean, default: false },
  isMultiSubmit: { type: Boolean, default: false }
});

const Order = mongoose.model('Order', orderSchema);

// ====================== 数据库连接 ======================
let dbConnectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

async function connectToDatabase() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('错误：MONGODB_URI 环境变量未设置');
      console.error('请在Render.com的项目设置中配置MONGODB_URI环境变量');
      process.exit(1);
    }
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ MongoDB 连接成功');
    dbConnectionAttempts = 0;
    
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB 连接错误:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB 连接断开，尝试重连...');
      if (dbConnectionAttempts < MAX_CONNECTION_ATTEMPTS) {
        dbConnectionAttempts++;
        setTimeout(connectToDatabase, 2000);
      }
    });
    
  } catch (err) {
    console.error('❌ MongoDB 连接失败:', err.message);
    
    if (dbConnectionAttempts < MAX_CONNECTION_ATTEMPTS) {
      dbConnectionAttempts++;
      console.log(`尝试重新连接 (${dbConnectionAttempts}/${MAX_CONNECTION_ATTEMPTS})...`);
      setTimeout(connectToDatabase, 2000);
    } else {
      console.error('达到最大重试次数，应用将退出');
      process.exit(1);
    }
  }
}

connectToDatabase();

// ====================== 工具函数 ======================
function generateOrderId() {
  const date = new Date();
  const dateStr = date.getFullYear().toString() + 
                  String(date.getMonth() + 1).padStart(2, '0') + 
                  String(date.getDate()).padStart(2, '0');
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SQY${dateStr}${randomStr}`;
}

function calculateTotal(carList) {
  let total = 0;
  (carList || []).forEach(item => {
    if (item.price !== undefined && item.price !== null) {
      total += Number(item.price) || 0;
    } else {
      if (item.name && item.name.includes('中午考点更换')) {
        total += 1;
      } else if (item.school && SCHOOL_PRICE.hasOwnProperty(item.school)) { // 🔧 修复
        total += SCHOOL_PRICE[item.school];
      } else if (item.from && item.to) {
        const fromPrice = SCHOOL_PRICE[item.from] || 0;
        const toPrice = SCHOOL_PRICE[item.to] || 0;
        total += Math.max(fromPrice, toPrice, 1);
      }
    }
  });
  return total;
}

function mergeCarLists(oldList, newList) {
  const carMap = new Map();
  
  oldList.forEach(car => { 
    if (car.name) {
      if (!car.price && car.price !== 0) {
        if (car.name.includes('中午考点更换')) {
          car.price = 1;
        } else if (car.school && SCHOOL_PRICE.hasOwnProperty(car.school)) { // 🔧 修复
          car.price = SCHOOL_PRICE[car.school];
        } else if (car.from && car.to) {
          const fromPrice = SCHOOL_PRICE[car.from] || 0;
          const toPrice = SCHOOL_PRICE[car.to] || 0;
          car.price = Math.max(fromPrice, toPrice, 1);
        }
      }
      carMap.set(car.name, car); 
    }
  });
  
  newList.forEach(car => { 
    if (car.name) {
      if (!car.price && car.price !== 0) {
        if (car.name.includes('中午考点更换')) {
          car.price = 1;
        } else if (car.school && SCHOOL_PRICE.hasOwnProperty(car.school)) { // 🔧 修复
          car.price = SCHOOL_PRICE[car.school];
        } else if (car.from && car.to) {
          const fromPrice = SCHOOL_PRICE[car.from] || 0;
          const toPrice = SCHOOL_PRICE[car.to] || 0;
          car.price = Math.max(fromPrice, toPrice, 1);
        }
      }
      carMap.set(car.name, car); 
    }
  });
  
  const FIXED_CAR_ORDER = [
    '4月11日早送','4月11日晚接','4月12日早送','4月12日晚接',
    '4月11日中午考点更换','4月12日中午考点更换'
  ];
  return FIXED_CAR_ORDER.filter(name => carMap.has(name)).map(name => carMap.get(name));
}

// ====================== 核心接口 ======================
app.post('/api/getAllOrders', async (req, res) => {
  try {
    const { pwd } = req.body;
    if (pwd !== process.env.ADMIN_PWD) {
      return res.json({ code: -1, msg: '密码错误' });
    }
    const orders = await Order.find().sort({ createTime: -1 });
    res.json({ code: 0, data: orders });
  } catch (err) {
    console.error('获取订单失败:', err);
    res.json({ code: -1, msg: '获取订单失败' });
  }
});

app.post('/api/submitOrder', async (req, res) => {
  try {
    const { userName, userPhone, carList, payType, createTime } = req.body;
    if (!userName || !userPhone || !carList || !payType || !createTime) {
      return res.json({ code: -1, msg: '参数不全' });
    }

    const validatedCarList = (carList || []).map(item => {
      const newItem = { ...item };
      if (newItem.price === undefined || newItem.price === null) {
        if (newItem.name && newItem.name.includes('中午考点更换')) {
          newItem.price = 1;
        } else if (newItem.school && SCHOOL_PRICE.hasOwnProperty(newItem.school)) { // 🔧 修复
          newItem.price = SCHOOL_PRICE[newItem.school];
        } else if (newItem.from && newItem.to) {
          const fromPrice = SCHOOL_PRICE[newItem.from] || 0;
          const toPrice = SCHOOL_PRICE[newItem.to] || 0;
          newItem.price = Math.max(fromPrice, toPrice, 1);
        } else {
          newItem.price = 0;
        }
      }
      return newItem;
    });

    const existingOrder = await Order.findOne({ userName, userPhone });
    if (existingOrder) {
      const mergedCarList = mergeCarLists(existingOrder.carList || [], validatedCarList || []);
      const newTotal = calculateTotal(mergedCarList);
      
      console.log(`✅ 合并订单：用户 ${userName}，原金额 ${existingOrder.total}，新金额 ${newTotal}`);
      
      existingOrder.total = newTotal;
      existingOrder.carList = mergedCarList;
      existingOrder.payType = payType;
      existingOrder.createTime = createTime;
      existingOrder.isMultiSubmit = true;
      existingOrder.isManuallyModified = false;
      existingOrder.paymentRecords.push({ payType, amount: newTotal, time: createTime });
      
      await existingOrder.save();
      return res.json({ code: 0, msg: '提交成功（合并到原有订单）', orderId: existingOrder.orderId });
    } else {
      const mergedCarList = mergeCarLists([], validatedCarList || []);
      const newTotal = calculateTotal(mergedCarList);
      const orderId = generateOrderId();
      const newOrder = new Order({
        orderId, 
        userName, 
        userPhone, 
        total: newTotal,
        carList: mergedCarList, 
        payType, 
        createTime,
        isMultiSubmit: false,
        isManuallyModified: false,
        payScreenshots: [],
        paymentRecords: [{ payType, amount: newTotal, time: createTime }]
      });
      await newOrder.save();
      
      console.log(`✅ 新订单创建：订单 ${orderId}，金额 ${newTotal}元`);
      
      return res.json({ code: 0, msg: '提交成功', orderId });
    }
  } catch (err) {
    console.error('提交订单失败:', err);
    res.json({ code: -1, msg: '提交失败，请重试' });
  }
});

app.post('/api/uploadScreenshot', async (req, res) => {
  try {
    const { orderId, screenshots } = req.body;
    if (!orderId || !screenshots || !Array.isArray(screenshots)) {
      return res.json({ code: -1, msg: '参数错误' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.json({ code: -1, msg: '订单不存在' });
    }
    order.payScreenshots.push(...screenshots);
    await order.save();
    res.json({ code: 0, msg: '截图上传成功' });
  } catch (err) {
    console.error('上传截图失败:', err);
    res.json({ code: -1, msg: '截图上传失败' });
  }
});

app.post('/api/recalculateAmount', async (req, res) => {
  try {
    const { pwd, orderId } = req.body;
    if (pwd !== process.env.ADMIN_PWD) {
      return res.json({ code: -1, msg: '密码错误' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.json({ code: -1, msg: '订单不存在' });
    }
    
    console.log(`🔄 开始刷新金额：订单 ${orderId}`);
    console.log(`原始carList:`, JSON.stringify(order.carList, null, 2));
    
    const recalculatedCarList = (order.carList || []).map(item => {
      if (!item || typeof item !== 'object') {
        console.warn(`⚠️ 发现无效的班次项:`, item);
        return { name: '未知班次', price: 0 };
      }
      
      const newItem = { ...item };
      const originalPrice = newItem.price || 0;
      let calculatedPrice = 0;
      
      if (newItem.name && newItem.name.includes('中午考点更换')) {
        calculatedPrice = 1;
      } else if (newItem.school && SCHOOL_PRICE.hasOwnProperty(newItem.school)) {
        calculatedPrice = SCHOOL_PRICE[newItem.school];
      } else if (newItem.from && newItem.to) {
        const fromPrice = SCHOOL_PRICE[newItem.from] || 0;
        const toPrice = SCHOOL_PRICE[newItem.to] || 0;
        calculatedPrice = Math.max(fromPrice, toPrice, 1);
      } else {
        console.warn(`⚠️ 订单 ${orderId} 的班次“${newItem.name}”无法匹配价格规则，将保留原价 ${originalPrice} 元。数据:`, JSON.stringify(newItem));
        calculatedPrice = originalPrice;
      }
      
      newItem.price = calculatedPrice;
      
      if (originalPrice !== calculatedPrice) {
        console.log(`  🔄 价格变化: ${originalPrice}元 -> ${calculatedPrice}元 (班次: ${newItem.name})`);
      }
      
      return newItem;
    });
    
    const newTotal = calculateTotal(recalculatedCarList);
    
    console.log(`💰 订单 ${orderId} 重新计算总金额: ${order.total}元 -> ${newTotal}元`);
    
    const originalIsManuallyModified = order.isManuallyModified;
    
    order.total = newTotal;
    order.carList = recalculatedCarList;
    order.isManuallyModified = originalIsManuallyModified;
    
    await order.save();
    
    console.log(`✅ 刷新金额成功：订单 ${orderId}，新金额 ${newTotal}元`);
    
    res.json({ 
      code: 0, 
      msg: `金额刷新成功，新金额：${newTotal}元`,
      newTotal: newTotal
    });
  } catch (err) {
    console.error('刷新金额失败:', err);
    res.json({ code: -1, msg: '刷新金额失败：' + err.message });
  }
});

app.post('/api/deleteOrder', async (req, res) => {
  try {
    const { pwd, id } = req.body;
    if (pwd !== process.env.ADMIN_PWD) {
      return res.json({ code: -1, msg: '密码错误' });
    }
    const result = await Order.findByIdAndDelete(id);
    if (!result) {
      return res.json({ code: -1, msg: '订单不存在' });
    }
    res.json({ code: 0, msg: '订单删除成功' });
  } catch (err) {
    console.error('删除订单失败:', err);
    res.json({ code: -1, msg: '删除失败' });
  }
});

app.get('/api/queryOrder', async (req, res) => {
  try {
    const { userName } = req.query;
    if (!userName) {
      return res.json({ code: -1, msg: '请输入姓名' });
    }
    const orders = await Order.find({ userName: new RegExp(userName) }).sort({ createTime: -1 });
    res.json({ code: 0, data: orders });
  } catch (err) {
    console.error('查询订单失败:', err);
    res.json({ code: -1, msg: '查询失败' });
  }
});

app.post('/api/updateOrder', async (req, res) => {
  try {
    const { pwd, orderId, updates } = req.body;
    
    if (pwd !== process.env.ADMIN_PWD) {
      return res.json({ code: -1, msg: '密码错误' });
    }
    
    if (!orderId || !updates) {
      return res.json({ code: -1, msg: '参数不全' });
    }
    
    const isModifyingCarList = updates.carList !== undefined;
    
    const updateData = { ...updates };
    
    if (isModifyingCarList) {
      const validatedCarList = (updates.carList || []).map(item => {
        const newItem = { ...item };
        if (!newItem.price && newItem.price !== 0) {
          if (newItem.name && newItem.name.includes('中午考点更换')) {
            newItem.price = 1;
          } else if (newItem.school && SCHOOL_PRICE.hasOwnProperty(newItem.school)) { // 🔧 修复
            newItem.price = SCHOOL_PRICE[newItem.school];
          } else if (newItem.from && newItem.to) {
            const fromPrice = SCHOOL_PRICE[newItem.from] || 0;
            const toPrice = SCHOOL_PRICE[newItem.to] || 0;
            newItem.price = Math.max(fromPrice, toPrice, 1);
          }
        }
        return newItem;
      });
      
      updateData.carList = validatedCarList;
      updateData.total = calculateTotal(validatedCarList);
      updateData.isManuallyModified = true;
      console.log(`📝 订单 ${orderId} 被标记为手动修改 (通过updateOrder接口)`);
    } else {
      const originalOrder = await Order.findOne({ orderId });
      if (originalOrder && originalOrder.isManuallyModified) {
        updateData.isManuallyModified = true;
      }
    }
    
    const order = await Order.findOneAndUpdate(
      { orderId },
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!order) {
      return res.json({ code: -1, msg: '订单不存在' });
    }
    
    res.json({ 
      code: 0, 
      msg: '订单更新成功',
      data: order
    });
    
  } catch (err) {
    console.error('更新订单失败:', err);
    res.json({ code: -1, msg: '更新订单失败' });
  }
});

app.post('/api/updateCarItem', async (req, res) => {
  try {
    const { pwd, orderId, carIndex, updates } = req.body;
    
    if (pwd !== process.env.ADMIN_PWD) {
      return res.json({ code: -1, msg: '密码错误' });
    }
    
    if (!orderId || carIndex === undefined || !updates) {
      return res.json({ code: -1, msg: '参数不全' });
    }
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.json({ code: -1, msg: '订单不存在' });
    }
    
    if (order.carList && order.carList[carIndex]) {
      const oldCarItem = { ...order.carList[carIndex] };
      const newCarItem = { ...oldCarItem, ...updates };
      
      if (!newCarItem.price && newCarItem.price !== 0) {
        if (newCarItem.name && newCarItem.name.includes('中午考点更换')) {
          newCarItem.price = 1;
        } else if (newCarItem.school && SCHOOL_PRICE.hasOwnProperty(newCarItem.school)) { // 🔧 修复
          newCarItem.price = SCHOOL_PRICE[newCarItem.school];
        } else if (newCarItem.from && newCarItem.to) {
          const fromPrice = SCHOOL_PRICE[newCarItem.from] || 0;
          const toPrice = SCHOOL_PRICE[newCarItem.to] || 0;
          newCarItem.price = Math.max(fromPrice, toPrice, 1);
        }
      }
      
      order.carList[carIndex] = newCarItem;
      
      const hasChanged = JSON.stringify(oldCarItem) !== JSON.stringify(newCarItem);
      
      if (hasChanged) {
        order.isManuallyModified = true;
        order.total = calculateTotal(order.carList);
        console.log(`📝 订单 ${orderId} 被标记为手动修改 (通过updateCarItem接口)`);
        await order.save();
      } else {
        return res.json({ code: 0, msg: '未检测到班次信息变化', data: order });
      }
    } else {
      return res.json({ code: -1, msg: '班次不存在' });
    }
    
    res.json({ 
      code: 0, 
      msg: '班次更新成功',
      data: order
    });
    
  } catch (err) {
    console.error('更新班次失败:', err);
    res.json({ code: -1, msg: '更新班次失败' });
  }
});

app.post('/api/debugOrder', async (req, res) => {
  try {
    const { pwd, orderId } = req.body;
    if (pwd !== process.env.ADMIN_PWD) {
      return res.json({ code: -1, msg: '密码错误' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.json({ code: -1, msg: '订单不存在' });
    }
    
    const recalculated = calculateTotal(order.carList);
    
    res.json({ 
      code: 0, 
      data: {
        order,
        recalculatedTotal: recalculated,
        carListDetails: order.carList || []
      }
    });
  } catch (err) {
    console.error('调试接口失败:', err);
    res.json({ code: -1, msg: '调试失败' });
  }
});

app.get('/debug-db', (req, res) => {
  const uri = process.env.MONGODB_URI;
  const maskedUri = uri.replace(/:(.*?)@/, ':****@');
  res.json({
    message: '当前数据库连接信息',
    database: maskedUri,
    databaseName: uri.split('/').pop().split('?')[0]
  });
});

// ====================== 健康检查接口 ======================
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '商职专车订单管理系统 API 运行正常',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ 
    status: 'ok',
    database: dbStatus,
    uptime: process.uptime()
  });
});

// ====================== 错误处理中间件 ======================
app.use((err, req, res, next) => {
  console.error('未捕获的错误:', err);
  res.status(500).json({ 
    code: -1, 
    msg: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.use((req, res) => {
  res.status(404).json({ code: -1, msg: '接口不存在' });
});

// ====================== 启动服务 ======================
if (!process.env.MONGODB_URI) {
  console.error('❌ 错误：MONGODB_URI 环境变量未设置');
  console.error('请在Render.com的项目设置中配置以下环境变量：');
  console.error('1. MONGODB_URI - MongoDB连接字符串');
  console.error('2. ADMIN_PWD - 后台管理密码');
  process.exit(1);
}

setTimeout(() => {
  app.listen(PORT, () => {
    console.log(`✅ 服务器运行在端口 ${PORT}`);
    console.log(`📁 数据库连接状态: ${mongoose.connection.readyState === 1 ? '已连接' : '未连接'}`);
    console.log(`🌍 访问地址: http://localhost:${PORT}`);
  });
}, 1000);
