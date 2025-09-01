// backend/server.js
// Este ficheiro implementa o backend da aplicação Cuca usando Node.js, Express.js e MySQL.

require('dotenv').config(); // Carrega variáveis de ambiente do ficheiro .env
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Usar a versão com Promise para async/await
const bcrypt = require('bcryptjs'); // Para hashing de senhas
const jwt = require('jsonwebtoken'); // Para JSON Web Tokens
const multer = require('multer'); // Para uploads de ficheiros
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // Para gerar UUIDs

const app = express();
const PORT = process.env.PORT || 5000;

// ==============================================================================
// CONFIGURAÇÃO DE CAMINHOS
// ==============================================================================
const PROJECT_ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');
const STATIC_FILES_DIR = path.join(FRONTEND_DIR, 'static');
const UPLOAD_FOLDER = path.join(__dirname, 'uploads');

// Assegura que a pasta 'uploads' existe
if (!require('fs').existsSync(UPLOAD_FOLDER)) {
    require('fs').mkdirSync(UPLOAD_FOLDER);
}

// ==============================================================================
// MIDDLEWARE
// ==============================================================================
app.use(cors()); // Permite requisições de diferentes origens (frontend)
app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições
app.use(express.urlencoded({ extended: true })); // Habilita o parsing de URL-encoded no corpo das requisições

// Serve ficheiros estáticos da pasta 'frontend'
app.use(express.static(FRONTEND_DIR));
app.use('/static', express.static(STATIC_FILES_DIR));
app.use('/uploads', express.static(UPLOAD_FOLDER)); // Para servir comprovativos de upload

// ==============================================================================
// CONFIGURAÇÃO DO MYSQL
// ==============================================================================
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ==============================================================================
// CONFIGURAÇÃO DE UPLOAD DE FICHEIROS (MULTER)
// ==============================================================================
const upload = multer({
    dest: UPLOAD_FOLDER,
    limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpg', 'image/jpeg', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de ficheiro não permitido. Apenas PNG, JPG, JPEG, PDF.'));
        }
    }
});

// ==============================================================================
// FUNÇÕES AUXILIARES DE AUTENTICAÇÃO E UTILS
// ==============================================================================

/**
 * Gera um código de utilizador único de 5 dígitos.
 * @returns {string} Código de utilizador único.
 */
async function generateUserIdCode() {
    let code;
    let [rows] = [];
    do {
        code = String(Math.floor(10000 + Math.random() * 90000));
        [rows] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE user_id_code = ?", [code]);
    } while (rows[0].count > 0);
    return code;
}

/**
 * Middleware para autenticação de JWT.
 * Adiciona `req.userId` se o token for válido.
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Não autorizado: Token ausente.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Não autorizado: Token inválido ou expirado.' });
        }
        req.userId = user.id; // Adiciona o ID do utilizador ao objeto de requisição
        next();
    });
};

// ==============================================================================
// ROTAS DO BACKEND (ENDPOINTS DA API)
// ==============================================================================

// Rota para o ficheiro HTML raiz (Login)
app.get('/', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'Login.html'));
});

// Rota para outros ficheiros HTML (por exemplo, Pagina inicial.html)
app.get('/:html_file.html', (req, res) => {
    const filePath = path.join(FRONTEND_DIR, `${req.params.html_file}.html`);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`Erro ao servir ${filePath}:`, err);
            res.status(404).send('Ficheiro não encontrado.');
        }
    });
});


app.post('/api/register', async (req, res) => {
    const { username, password, transactionPassword } = req.body;

    if (!username || !password || !transactionPassword) {
        return res.status(400).json({ message: 'Por favor, preencha todos os campos obrigatórios.' });
    }

    try {
        const [existingUser] = await pool.query("SELECT id FROM users WHERE username = ?", [username]);
        if (existingUser.length > 0) {
            return res.status(409).json({ message: 'Nome de utilizador já existe.' });
        }

        const userId = uuidv4();
        const userIdCode = await generateUserIdCode();
        const passwordHash = await bcrypt.hash(password, 10);
        const transactionPasswordHash = await bcrypt.hash(transactionPassword, 10);

        const sql = `
            INSERT INTO users 
            (id, username, password_hash, transaction_password_hash, balance, balance_recharge, balance_withdraw, user_id_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await pool.query(sql, [userId, username, passwordHash, transactionPasswordHash, 0.0, 0.0, 0.0, userIdCode]);

        console.log(`Utilizador registado: ${username} com ID: ${userId}`);
        res.status(201).json({ message: 'Cadastro realizado com sucesso!', userId: userId });
    } catch (err) {
        console.error('Erro no registo de utilizador:', err);
        res.status(500).json({ message: 'Erro interno do servidor ao registar utilizador.', error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Por favor, preencha todos os campos.' });
    }

    try {
        const [rows] = await pool.query("SELECT id, password_hash, user_id_code FROM users WHERE username = ?", [username]);
        const userFound = rows[0];

        if (!userFound || !(await bcrypt.compare(password, userFound.password_hash))) {
            return res.status(401).json({ message: 'Nome de utilizador ou senha inválidos.' });
        }

        const token = jwt.sign({ id: userFound.id }, process.env.JWT_SECRET, { expiresIn: '24h' }); // Token expira em 24h
        console.log(`Utilizador logado: ${username} com token JWT.`);
        res.status(200).json({
            message: 'Login bem-sucedido!',
            token: token,
            userId: userFound.id,
            userIdCode: userFound.user_id_code,
            username: username // Inclui o username na resposta para o frontend
        });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ message: 'Erro interno do servidor ao tentar login.', error: err.message });
    }
});

app.post('/api/logout', authenticateToken, async (req, res) => {
    // Com JWTs, o "logout" no backend é mais simbólico, pois o token apenas expira
    // ou o frontend o descarta. Podemos adicionar uma blacklist se necessário,
    // mas para este cenário, basta retornar sucesso.
    console.log(`Utilizador ${req.userId} fez logout (token descartado no cliente).`);
    res.status(200).json({ message: 'Logout bem-sucedido.' });
});

app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT username, user_id_code, balance, balance_recharge, balance_withdraw, " +
            "linked_account_bank_name, linked_account_number, linked_account_holder " +
            "FROM users WHERE id = ?",
            [req.userId]
        );
        const userData = rows[0];

        if (!userData) {
            return res.status(404).json({ message: 'Utilizador não encontrado.' });
        }

        const dashboardInfo = {
            username: userData.username,
            userIdCode: userData.user_id_code,
            balance: parseFloat(userData.balance),
            balance_recharge: parseFloat(userData.balance_recharge),
            balance_withdraw: parseFloat(userData.balance_withdraw),
            linked_account_bank_name: userData.linked_account_bank_name,
            linked_account_number: userData.linked_account_number,
            linked_account_holder: userData.linked_account_holder,
            linked_account_exists: !!userData.linked_account_number, // Converte para booleano
        };
        res.status(200).json(dashboardInfo);
    } catch (err) {
        console.error('Erro ao obter dados do dashboard:', err);
        res.status(500).json({ message: 'Erro interno do servidor ao carregar dashboard.', error: err.message });
    }
});

app.get('/api/linked_account', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT linked_account_bank_name, linked_account_number, linked_account_holder " +
            "FROM users WHERE id = ?",
            [req.userId]
        );
        const accountData = rows[0];

        if (!accountData || !accountData.linked_account_number) {
            return res.status(404).json({ message: 'Nenhuma conta vinculada encontrada.' });
        }

        res.status(200).json({
            bank_name: accountData.linked_account_bank_name,
            account_number: accountData.linked_account_number,
            account_holder: accountData.linked_account_holder
        });
    } catch (err) {
        console.error('Erro ao obter conta vinculada:', err);
        res.status(500).json({ message: 'Erro interno do servidor ao obter conta vinculada.', error: err.message });
    }
});

// A rota de depósito usa 'upload.single('file')' para lidar com o upload do ficheiro
// A rota de depósito usa 'upload.single('file')' para lidar com o upload do ficheiro
app.post('/api/deposit', authenticateToken, upload.single('file'), async (req, res) => {
    const { amount: amountStr } = req.body;
    const file = req.file; 
    let connection; // ✅ declarar no início

    if (!amountStr) {
        return res.status(400).json({ error: 'Valor do depósito é obrigatório.' });
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Valor de depósito inválido.' });
    }

    if (!file) {
        return res.status(400).json({ error: 'Comprovativo de pagamento é obrigatório.' });
    }

    const filename = `${req.userId}_${Date.now()}_${file.originalname}`;
    const filepath = path.join(UPLOAD_FOLDER, filename);

    try {
        await require('fs/promises').rename(file.path, filepath);

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const depositId = uuidv4();
        const sqlDeposit = `
            INSERT INTO deposits (id, user_id, amount, status, timestamp, receipt_filename)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        // 🔹 Agora o status inicial é "Pendente", sem atualizar o saldo ainda
        await connection.query(sqlDeposit, [depositId, req.userId, amount, 'Pendente', new Date(), filename]);

        await connection.commit();

        console.log(`Depósito de Kz ${amount} registado para o utilizador ${req.userId}, aguardando aprovação do admin.`);
        res.status(200).json({
            message: 'Depósito enviado para análise do administrador. O saldo será atualizado após aprovação.'
        });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Erro no depósito:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao processar depósito.', message: err.message });
    } finally {
        if (connection) connection.release();
    }
});

    
app.post('/api/withdraw', authenticateToken, async (req, res) => {
    const { withdrawAmount: amountStr, transactionPassword } = req.body;
    let connection; // ✅ declara aqui no escopo da função

    if (!amountStr || !transactionPassword) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios para o saque.' });
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Valor de saque inválido.' });
    }

    try {
        const [userRows] = await pool.query(
            "SELECT transaction_password_hash, balance_withdraw, balance, linked_account_number FROM users WHERE id = ?",
            [req.userId]
        );
        const user = userRows[0];

        if (!user) {
            return res.status(404).json({ error: 'Utilizador não encontrado.' });
        }

        if (!(await bcrypt.compare(transactionPassword, user.transaction_password_hash))) {
            return res.status(401).json({ error: 'Senha de transação incorreta.' });
        }

        if (!user.linked_account_number) {
            return res.status(400).json({ error: 'Nenhuma conta vinculada para saque. Por favor, vincule uma conta primeiro.' });
        }

        if (amount > user.balance_withdraw) {
            return res.status(400).json({ error: 'Saldo de saque insuficiente.' });
        }

        const fee = amount * (process.env.WITHDRAW_FEE_PERCENTAGE || 0.05);
        const actualAmount = amount - fee;

        connection = await pool.getConnection(); // ✅ só inicializa aqui
        await connection.beginTransaction();

        await connection.query(
            "UPDATE users SET balance_withdraw = balance_withdraw - ?, balance = balance - ? WHERE id = ?",
            [amount, amount, req.userId]
        );

        const withdrawalId = uuidv4();
        const sqlWithdrawal = `
            INSERT INTO withdrawals (id, user_id, requested_amount, fee, actual_amount, status, timestamp, account_number_used)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.query(sqlWithdrawal, [
            withdrawalId,
            req.userId,
            amount,
            fee,
            actualAmount,
            'Pendente',
            new Date(),
            user.linked_account_number
        ]);

        await connection.commit();

        const [updatedBalanceRows] = await pool.query(
            "SELECT balance_withdraw FROM users WHERE id = ?",
            [req.userId]
        );
        const updatedBalanceWithdraw = updatedBalanceRows[0].balance_withdraw;

        console.log(`Saque de Kz ${amount} solicitado pelo utilizador ${req.userId}. Saldo Saque Restante: ${updatedBalanceWithdraw}`);
        res.status(200).json({
            message: 'Pedido de saque registado com sucesso!',
            new_balance_withdraw: parseFloat(updatedBalanceWithdraw),
            actual_amount_received: actualAmount
        });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Erro no saque:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao processar saque.', message: err.message });
    } finally {
        if (connection) connection.release();
    }
});


app.post('/api/link-account', authenticateToken, async (req, res) => {
    const { bankName, accountNumber, accountHolder, transactionPassword } = req.body;

    if (!bankName || !accountNumber || !accountHolder || !transactionPassword) {
        return res.status(400).json({ error: 'Todos os campos da conta são obrigatórios.' });
    }

    try {
        const [userRows] = await pool.query("SELECT transaction_password_hash FROM users WHERE id = ?", [req.userId]);
        const userInfo = userRows[0];

        if (!userInfo) {
            return res.status(404).json({ error: 'Utilizador não encontrado.' });
        }

        if (!(await bcrypt.compare(transactionPassword, userInfo.transaction_password_hash))) {
            return res.status(401).json({ error: 'Senha de transação incorreta.' });
        }

        const sql = `
            UPDATE users SET 
            linked_account_bank_name = ?, 
            linked_account_number = ?, 
            linked_account_holder = ? 
            WHERE id = ?
        `;
        await pool.query(sql, [bankName, accountNumber, accountHolder, req.userId]);

        console.log(`Conta vinculada para o utilizador ${req.userId}: ${bankName} - ${accountNumber}`);
        res.status(200).json({ message: 'Conta vinculada com sucesso!' });
    } catch (err) {
        console.error('Erro ao vincular conta:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao vincular conta.', message: err.message });
    }
});

app.get('/api/withdrawals/history', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT requested_amount, fee, actual_amount, status, timestamp, account_number_used FROM withdrawals WHERE user_id = ? ORDER BY timestamp DESC",
            [req.userId]
        );
        const history = rows.map(item => ({
            requested_amount: parseFloat(item.requested_amount),
            fee: parseFloat(item.fee),
            actual_amount: parseFloat(item.actual_amount),
            status: item.status,
            timestamp: item.timestamp.toISOString(),
            account_number_used: item.account_number_used
        }));

        res.status(200).json({ history: history });
    } catch (err) {
        console.error('Erro ao obter histórico de saques:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao carregar histórico.', message: err.message });
    }
});

// ==============================================================================
// INICIAR O SERVIDOR
// ==============================================================================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`cucaproject-cucaproject1.up.railway.app ${PORT}`);
    console.log('Rotas disponíveis:');
    console.log(`- POST /api/register`);
    console.log(`- POST /api/login`);
    console.log(`- POST /api/logout`);
    console.log(`- GET /api/dashboard`);
    console.log(`- GET /api/linked_account`);
    console.log(`- POST /api/deposit`);
    console.log(`- POST /api/withdraw`);
    console.log(`- POST /api/link-account`);
    console.log(`- GET /api/withdrawals/history`);
    console.log(`- GET /api/deposits/history`);
console.log(`- GET /api/investments/history`);

    console.log(`- Servindo ficheiros estáticos da pasta frontend/`);
});

// Adicione esta rota em algum lugar com as outras rotas GET, por exemplo,
// após a rota '/api/withdrawals/history'.

// Rota para obter o histórico de depósitos de um utilizador
app.get('/api/deposits/history', authenticateToken, async (req, res) => {
    try {
        // Assume que você tem uma tabela 'deposits' com as colunas:
        // id, user_id, amount, status, timestamp, receipt_filename
        const [rows] = await pool.query(
            "SELECT id, amount, status, timestamp, receipt_filename FROM deposits WHERE user_id = ? ORDER BY timestamp DESC",
            [req.userId]
        );

        const history = rows.map(item => ({
            id: item.id,
            amount: parseFloat(item.amount), // Garante que o valor seja um número
            status: item.status,
            timestamp: item.timestamp.toISOString(), // Converte para formato ISO string
            receipt_filename: item.receipt_filename // Nome do ficheiro do comprovativo, se existir
        }));

        res.status(200).json({ history: history });
    } catch (err) {
        console.error('Erro ao obter histórico de depósitos:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao carregar histórico de depósitos.', message: err.message });
    }
});

// Não se esqueça de adicionar esta nova rota à lista de rotas disponíveis no `app.listen`
// console.log(`- GET /api/deposits/history`);


app.use(express.static("public"));
app.get('/api/investments/history', authenticateToken, async (req, res) => {
    try {
        // Supondo que você tem uma tabela 'investments' com as colunas:
        // id, user_id, package_name, amount, roi, status, timestamp
        const [rows] = await pool.query(
            "SELECT id, package_name, amount, roi, status, timestamp FROM investments WHERE user_id = ? ORDER BY timestamp DESC",
            [req.userId]
        );

        const history = rows.map(item => ({
            id: item.id,
            packageName: item.package_name,
            amount: parseFloat(item.amount),
            roi: item.roi, // Pode ser número ou string, dependendo da estrutura
            status: item.status,
            timestamp: item.timestamp.toISOString()
        }));

        res.status(200).json({ history: history });
    } catch (err) {
        console.error('Erro ao obter histórico de investimentos:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao carregar histórico de investimentos.', message: err.message });
    }
});
