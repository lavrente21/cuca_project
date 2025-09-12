 // backend/server.js
// Este ficheiro implementa o backend da aplicação Cuca usando Node.js, Express.js e PostgreSQL.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 5000;

// ==============================================================================
// CONFIGURAÇÃO INICIAL
// ==============================================================================
const PROJECT_ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');
const STATIC_FILES_DIR = path.join(FRONTEND_DIR, 'static');
const UPLOAD_FOLDER = path.join(__dirname, 'uploads');

// Assegura que a pasta 'uploads' existe
if (!fs.existsSync(UPLOAD_FOLDER)) {
    fs.mkdirSync(UPLOAD_FOLDER);
}

// ==============================================================================
// MIDDLEWARE
// ==============================================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_FOLDER));
app.use(express.static(path.join(FRONTEND_DIR, 'public'))); // Adicione esta linha se tiver uma pasta 'public'

// Configuração CORS


app.use(cors({
    origin: '*',              // 🔥 libera acesso de qualquer origem
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));


// Teste CORS
app.get("/", (req, res) => {
  res.json({ message: "Servidor rodando com CORS ativo 🚀" });
});

// ==============================================================================
// CONFIGURAÇÃO DO POSTGRES
// ==============================================================================
const pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT,
    max: 25,
    ssl: { rejectUnauthorized: false } // Render exige SSL
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
// FUNÇÕES AUXILIARES E MIDDLEWARE DE AUTENTICAÇÃO
// ==============================================================================
async function generateUserIdCode() {
    let code;
    let rows;
    do {
        code = String(Math.floor(10000 + Math.random() * 90000));
        const res = await pool.query("SELECT COUNT(*) AS count FROM users WHERE user_id_code = $1", [code]);
        rows = res.rows;
    } while (parseInt(rows[0].count, 10) > 0);
    return code;
}

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
        req.userId = user.id;
        next();
    });
};

// ==============================================================================
// ROTAS DO BACKEND (ENDPOINTS DA API)
// ==============================================================================

// -------------------- REGISTRO --------------------
app.post('/api/register', async (req, res) => {
    const { username, password, transactionPassword } = req.body;
    if (!username || !password || !transactionPassword) {
        return res.status(400).json({ message: 'Por favor, preencha todos os campos obrigatórios.' });
    }
    try {
        const existing = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ message: 'Nome de utilizador já existe.' });
        }
        const userId = uuidv4();
        const userIdCode = await generateUserIdCode();
        const passwordHash = await bcrypt.hash(password, 10);
        const transactionPasswordHash = await bcrypt.hash(transactionPassword, 10);
        const sql = `
            INSERT INTO users
            (id, username, password_hash, transaction_password_hash, balance, balance_recharge, balance_withdraw, user_id_code)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        await pool.query(sql, [userId, username, passwordHash, transactionPasswordHash, 0.0, 0.0, 0.0, userIdCode]);
        console.log(`Utilizador registado: ${username} com ID: ${userId}`);
        res.status(201).json({ message: 'Cadastro realizado com sucesso!', userId: userId });
    } catch (err) {
        console.error('Erro no registo de utilizador:', err);
        res.status(500).json({ message: 'Erro interno do servidor ao registar utilizador.', error: err.message });
    }
});

// -------------------- LOGIN --------------------
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Por favor, preencha todos os campos.' });
    }
    try {
        const result = await pool.query("SELECT id, password_hash, user_id_code FROM users WHERE username = $1", [username]);
        const userFound = result.rows[0];
        if (!userFound || !(await bcrypt.compare(password, userFound.password_hash))) {
            return res.status(401).json({ message: 'Nome de utilizador ou senha inválidos.' });
        }
        const token = jwt.sign({ id: userFound.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        console.log(`Utilizador logado: ${username} com token JWT.`);
        res.status(200).json({
            message: 'Login bem-sucedido!',
            token: token,
            userId: userFound.id,
            userIdCode: userFound.user_id_code,
            username: username
        });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ message: 'Erro interno do servidor ao tentar login.', error: err.message });
    }
});

// -------------------- LOGOUT --------------------
app.post('/api/logout', authenticateToken, async (req, res) => {
    console.log(`Utilizador ${req.userId} fez logout (token descartado no cliente).`);
    res.status(200).json({ message: 'Logout bem-sucedido.' });
});

// -------------------- DASHBOARD USUÁRIO --------------------
app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT username, user_id_code, balance, balance_recharge, balance_withdraw, linked_account_bank_name, linked_account_number, linked_account_holder FROM users WHERE id = $1",
            [req.userId]
        );
        const userData = result.rows[0];
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
            linked_account_exists: !!userData.linked_account_number,
        };
        res.status(200).json(dashboardInfo);
    } catch (err) {
        console.error('Erro ao obter dados do dashboard:', err);
        res.status(500).json({ message: 'Erro interno do servidor ao carregar dashboard.', error: err.message });
    }
});

// -------------------- CONTA VINCULADA --------------------
app.get('/api/linked_account', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT linked_account_bank_name, linked_account_number, linked_account_holder FROM users WHERE id = $1",
            [req.userId]
        );
        const accountData = result.rows[0];
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

// -------------------- DEPÓSITO --------------------
app.post('/api/deposit', authenticateToken, upload.single('file'), async (req, res) => {
    const { amount: amountStr } = req.body;
    const file = req.file;
    let client;
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
        await fs.promises.rename(file.path, filepath);
        client = await pool.connect();
        await client.query('BEGIN');
        const depositId = uuidv4();
        const sqlDeposit = `
            INSERT INTO deposits (id, user_id, amount, status, timestamp, receipt_filename)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await client.query(sqlDeposit, [depositId, req.userId, amount, 'Pendente', new Date(), filename]);
        await client.query('COMMIT');
        console.log(`Depósito de Kz ${amount} registado para o utilizador ${req.userId}, aguardando aprovação do admin.`);
        res.status(200).json({
            message: 'Depósito enviado para análise do administrador. O saldo será atualizado após aprovação.'
        });
    } catch (err) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
        }
        console.error('Erro no depósito:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao processar depósito.', message: err.message });
    } finally {
        if (client) client.release();
    }
});

// -------------------- INVESTIR EM PACOTE --------------------
// -------------------- INVESTIR EM PACOTE --------------------
app.post('/api/invest', authenticateToken, async (req, res) => {
    const { packageId, amount: amountRaw } = req.body;
    const amount = parseFloat(amountRaw);

    if (!packageId || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Pacote e valor válidos são obrigatórios.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1) Buscar pacote
        const pkgRes = await client.query(
            "SELECT daily_return_rate, duration_days, min_investment, max_investment, status FROM investment_packages WHERE id = $1",
            [packageId]
        );
        if (pkgRes.rows.length === 0) throw new Error("Pacote não encontrado.");
        const pkg = pkgRes.rows[0];
        if (pkg.status !== 'Ativo') throw new Error("Pacote não está ativo.");

        // 2) Verifica limites do pacote
        if (amount < parseFloat(pkg.min_investment) || amount > parseFloat(pkg.max_investment)) {
            throw new Error(`O valor do investimento deve estar entre ${pkg.min_investment} e ${pkg.max_investment}`);
        }

        // 3) Verifica saldo_recharge do usuário
        const userRes = await client.query("SELECT balance_recharge FROM users WHERE id = $1 FOR UPDATE", [req.userId]);
        const user = userRes.rows[0];
        if (!user) throw new Error("Usuário não encontrado.");
        if (parseFloat(user.balance_recharge) < amount) throw new Error("Saldo de recarga insuficiente.");

        // 4) Calcula ganho diário
        const dailyEarning = parseFloat((amount * (parseFloat(pkg.daily_return_rate) / 100)).toFixed(2));

        // 5) Inserir investimento
        const investmentId = uuidv4();
        await client.query(
            `INSERT INTO user_investments
             (id, user_id, package_id, amount, daily_earning, days_remaining, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [investmentId, req.userId, packageId, amount, dailyEarning, pkg.duration_days, 'ativo']
        );

        // 6) Desconta apenas do balance_recharge (evita desconto duplicado)
        await client.query(
            "UPDATE users SET balance_recharge = balance_recharge - $1 WHERE id = $2",
            [amount, req.userId]
        );

        await client.query('COMMIT');
        res.status(200).json({ message: 'Investimento criado com sucesso!', investmentId });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
        console.error('Erro ao criar investimento:', err);
        res.status(500).json({ message: 'Erro ao criar investimento.', error: err.message });
    } finally {
        client.release();
    }
});


// -------------------- INVESTIMENTOS DO USUÁRIO --------------------
app.get('/api/investments/active', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ui.id,
                    ui.package_id,
                    ip.name AS package_name,
                    ui.amount,
                    ui.daily_earning,
                    ui.days_remaining,
                    ui.status,
                    ui.created_at
             FROM user_investments ui
             LEFT JOIN investment_packages ip ON ui.package_id = ip.id
             WHERE ui.user_id = $1
             ORDER BY ui.created_at DESC`,
            [req.userId]
        );

        const investments = result.rows.map(inv => ({
            id: inv.id,
            packageId: inv.package_id,
            packageName: inv.package_name,
            amount: parseFloat(inv.amount),
            dailyEarning: parseFloat(inv.daily_earning),
            daysRemaining: inv.days_remaining,
            status: inv.status,
            createdAt: inv.created_at ? inv.created_at.toISOString() : null
        }));

        res.status(200).json({ investments });
    } catch (err) {
        console.error('Erro ao buscar investimentos ativos do usuário:', err);
        res.status(500).json({ message: 'Erro interno ao obter investimentos.', error: err.message });
    }
});



// -------------------- LISTAR PACOTES (PÚBLICO/FRONTEND) --------------------
app.get('/api/packages', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, name, description, min_investment, max_investment, daily_return_rate, duration_days, status FROM investment_packages WHERE status = 'Ativo' ORDER BY created_at DESC"
        );
        res.status(200).json({ packages: result.rows });
    } catch (err) {
        console.error("Erro ao listar pacotes (frontend):", err);
        res.status(500).json({ error: "Erro ao listar pacotes" });
    }
});


// -------------------- SAQUE --------------------

app.post('/api/withdraw', authenticateToken, async (req, res) => {

    const { withdrawAmount: amountStr, transactionPassword } = req.body;

    let client;

    if (!amountStr || !transactionPassword) {

        return res.status(400).json({ error: 'Todos os campos são obrigatórios para o saque.' });

    }

    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {

        return res.status(400).json({ error: 'Valor de saque inválido.' });

    }

    try {

        const userRes = await pool.query(

            "SELECT transaction_password_hash, balance_withdraw, balance, linked_account_number FROM users WHERE id = $1",

            [req.userId]

        );

        const user = userRes.rows[0];

        if (!user) {

            return res.status(404).json({ error: 'Utilizador não encontrado.' });

        }

        if (!(await bcrypt.compare(transactionPassword, user.transaction_password_hash))) {

            return res.status(401).json({ error: 'Senha de transação incorreta.' });

        }

        if (!user.linked_account_number) {

            return res.status(400).json({ error: 'Nenhuma conta vinculada para saque. Por favor, vincule uma conta primeiro.' });

        }

        if (amount > parseFloat(user.balance_withdraw)) {

            return res.status(400).json({ error: 'Saldo de saque insuficiente.' });

        }

        const fee = amount * (parseFloat(process.env.WITHDRAW_FEE_PERCENTAGE || '0.05'));

        const actualAmount = amount - fee;



        client = await pool.connect();

        await client.query('BEGIN');



        await client.query(

            "UPDATE users SET balance_withdraw = balance_withdraw - $1, balance = balance - $2 WHERE id = $3",

            [amount, amount, req.userId]

        );



        const withdrawalId = uuidv4();

        const sqlWithdrawal = `

            INSERT INTO withdrawals (id, user_id, requested_amount, fee, actual_amount, status, timestamp, account_number_used)

            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)

        `;

        await client.query(sqlWithdrawal, [

            withdrawalId,

            req.userId,

            amount,

            fee,

            actualAmount,

            'Pendente',

            new Date(),

            user.linked_account_number

        ]);



        await client.query('COMMIT');



        const updatedBalanceRes = await pool.query(

            "SELECT balance_withdraw FROM users WHERE id = $1",

            [req.userId]

        );

        const updatedBalanceWithdraw = updatedBalanceRes.rows[0].balance_withdraw;

        console.log(`Saque de Kz ${amount} solicitado pelo utilizador ${req.userId}. Saldo Saque Restante: ${updatedBalanceWithdraw}`);

        res.status(200).json({

            message: 'Pedido de saque registado com sucesso!',

            new_balance_withdraw: parseFloat(updatedBalanceWithdraw),

            actual_amount_received: actualAmount

        });

    } catch (err) {

        if (client) {

            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }

        }

        console.error('Erro no saque:', err);

        res.status(500).json({ error: 'Erro interno do servidor ao processar saque.', message: err.message });

    } finally {

        if (client) client.release();

    }

});



// -------------------- HISTÓRICO DE INVESTIMENTOS --------------------

app.get('/api/investments/history', authenticateToken, async (req, res) => {

    try {

        const result = await pool.query(

            `SELECT ui.id,

                    ui.amount,

                    ui.daily_earning,

                    ui.days_remaining,

                    ui.status,

                    ui.created_at,

                    p.name AS package_name,

                    p.duration_days,

                    p.daily_return_rate

             FROM user_investments ui

             JOIN investment_packages p ON ui.package_id = p.id

             WHERE ui.user_id = $1

             ORDER BY ui.created_at DESC`,

            [req.userId]

        );



        const history = [];



        result.rows.forEach(row => {

            // 1) Compra do pacote (registro inicial)

            history.push({

                id: row.id,

                type: 'investment',

                amount: parseFloat(row.amount),

                packageName: row.package_name,

                roi: `${row.daily_return_rate}% por ${row.duration_days} dias`,

                status: row.status,

                timestamp: row.created_at

            });



            // 2) Calcular quantos retornos já estão liberados

            const now = new Date();

            const createdAt = new Date(row.created_at);

            const diffMs = now - createdAt;



            // só libera um ganho se já passaram 24h

            const daysPassed = Math.floor(diffMs / 86400000);



            // não pode mostrar mais do que a duração do pacote

            const daysToShow = Math.min(daysPassed, row.duration_days);



            // 3) Adicionar cada retorno diário liberado

            for (let i = 0; i < daysToShow; i++) {

                const payDate = new Date(createdAt.getTime() + (i + 1) * 86400000);



                // garante que só aparece se a data já passou

                if (payDate <= now) {

                    history.push({

                        id: `${row.id}-day-${i + 1}`,

                        type: 'earning',

                        amount: parseFloat(row.daily_earning),

                        packageName: row.package_name,

                        roi: `Retorno diário (${row.daily_return_rate}%)`,

                        status: 'Pago',

                        timestamp: payDate

                    });

                }

            }

        });



        res.json({ history });

    } catch (err) {

        console.error("Erro ao buscar histórico de investimentos:", err);

        res.status(500).json({ message: "Erro ao buscar histórico de investimentos." });

    }

});







// -------------------- VINCULAR CONTA --------------------

app.post('/api/link-account', authenticateToken, async (req, res) => {

    const { bankName, accountNumber, accountHolder, transactionPassword } = req.body;

    if (!bankName || !accountNumber || !accountHolder || !transactionPassword) {

        return res.status(400).json({ error: 'Todos os campos da conta são obrigatórios.' });

    }

    try {

        const userRes = await pool.query("SELECT transaction_password_hash FROM users WHERE id = $1", [req.userId]);

        const userInfo = userRes.rows[0];

        if (!userInfo) {

            return res.status(404).json({ error: 'Utilizador não encontrado.' });

        }

        if (!(await bcrypt.compare(transactionPassword, userInfo.transaction_password_hash))) {

            return res.status(401).json({ error: 'Senha de transação incorreta.' });

        }

        const sql = `

            UPDATE users SET

            linked_account_bank_name = $1,

            linked_account_number = $2,

            linked_account_holder = $3

            WHERE id = $4

        `;

        await pool.query(sql, [bankName, accountNumber, accountHolder, req.userId]);

        console.log(`Conta vinculada para o utilizador ${req.userId}: ${bankName} - ${accountNumber}`);

        res.status(200).json({ message: 'Conta vinculada com sucesso!' });

    } catch (err) {

        console.error('Erro ao vincular conta:', err);

        res.status(500).json({ error: 'Erro interno do servidor ao vincular conta.', message: err.message });

    }

});



// -------------------- HISTÓRICOS --------------------

app.get('/api/withdrawals/history', authenticateToken, async (req, res) => {

    try {

        const result = await pool.query(

            "SELECT requested_amount, fee, actual_amount, status, timestamp, account_number_used FROM withdrawals WHERE user_id = $1 ORDER BY timestamp DESC",

            [req.userId]

        );

        const history = result.rows.map(item => ({

            requested_amount: parseFloat(item.requested_amount),

            fee: parseFloat(item.fee),

            actual_amount: parseFloat(item.actual_amount),

            status: item.status,

            timestamp: item.timestamp ? item.timestamp.toISOString() : null,

            account_number_used: item.account_number_used

        }));

        res.status(200).json({ history: history });

    } catch (err) {

        console.error('Erro ao obter histórico de saques:', err);

        res.status(500).json({ error: 'Erro interno do servidor ao carregar histórico.', message: err.message });

     // Antes de montar o histórico

for (const row of result.rows) {

    const now = new Date();

    const createdAt = new Date(row.created_at);



    const daysPassed = Math.floor((now - createdAt) / 86400000);

    const daysToCredit = Math.min(daysPassed, row.duration_days);



    // pega quantos dias já estão pagos

    const alreadyPaidRes = await pool.query(

        "SELECT COUNT(*) FROM investment_earnings WHERE investment_id = $1",

        [row.id]

    );

    const alreadyPaid = parseInt(alreadyPaidRes.rows[0].count, 10);



    // Se houver dias novos a pagar → credita no saldo_withdraw

    if (daysToCredit > alreadyPaid) {

        const newPayments = daysToCredit - alreadyPaid;



        await pool.query(

            "UPDATE users SET balance_withdraw = balance_withdraw + $1 WHERE id = $2",

            [row.daily_earning * newPayments, req.userId]

        );



        // salva os pagamentos (para não repetir)

        for (let i = alreadyPaid; i < daysToCredit; i++) {

            await pool.query(

                "INSERT INTO investment_earnings (id, investment_id, amount, paid_at) VALUES ($1, $2, $3, NOW())",

                [uuidv4(), row.id, row.daily_earning]

            );

        }

    }

}



    }

});



app.get('/api/deposits/history', authenticateToken, async (req, res) => {

    try {

        const result = await pool.query(

            "SELECT id, amount, status, timestamp, receipt_filename FROM deposits WHERE user_id = $1 ORDER BY timestamp DESC",

            [req.userId]

        );

        const history = result.rows.map(item => ({

            id: item.id,

            amount: parseFloat(item.amount),

            status: item.status,

            timestamp: item.timestamp ? item.timestamp.toISOString() : null,

            receipt_filename: item.receipt_filename

        }));

        res.status(200).json({ history: history });

    } catch (err) {

        console.error('Erro ao obter histórico de depósitos:', err);

        res.status(500).json({ error: 'Erro interno do servidor ao carregar histórico de depósitos.', message: err.message });

    }

});



app.get('/api/investments/history', authenticateToken, async (req, res) => {

    try {

        const result = await pool.query(

            "SELECT id, package_name, amount, roi, status, timestamp FROM investments WHERE user_id = $1 ORDER BY timestamp DESC",

            [req.userId]

        );

        const history = result.rows.map(item => ({

            id: item.id,

            packageName: item.package_name,

            amount: parseFloat(item.amount),

            roi: item.roi,

            status: item.status,

            timestamp: item.timestamp ? item.timestamp.toISOString() : null

        }));

        res.status(200).json({ history: history });

    } catch (err) {

        console.error('Erro ao obter histórico de investimentos:', err);

        res.status(500).json({ error: 'Erro interno do servidor ao carregar histórico de investimentos.', message: err.message });

    }

});



// ==============================================================================

// ROTAS ADMIN

// ==============================================================================



// Middleware para verificar admin

const authenticateAdmin = async (req, res, next) => {

    try {

        const result = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.userId]);

        if (!result.rows[0] || !result.rows[0].is_admin) {

            return res.status(403).json({ message: 'Acesso negado: Admin apenas.' });

        }

        next();

    } catch (err) {

        console.error('Erro ao autenticar admin:', err);

        res.status(500).json({ message: 'Erro interno ao verificar admin.' });

    }

};



// [Aqui entram todas as rotas admin que enviei na mensagem anterior]

// (Listagem de usuários, depósitos, saques, pacotes de investimento, posts, dashboard admin)

// ==============================================================================

// ROTAS ADMIN

// ==============================================================================



// -------------------- LISTAR USUÁRIOS --------------------

app.get('/api/admin/users', authenticateToken, authenticateAdmin, async (req, res) => {

    try {

        const result = await pool.query(

            "SELECT id, username, user_id_code, balance, balance_recharge, balance_withdraw, is_admin FROM users ORDER BY username ASC"

        );

        res.status(200).json({ users: result.rows });

    } catch (err) {

        console.error('Erro ao listar usuários (admin):', err);

        res.status(500).json({ message: 'Erro interno ao carregar usuários.', error: err.message });

    }

});



// ========================

// Atualizar usuário (Admin)

// ========================

app.put('/api/admin/users/:id', authenticateToken, authenticateAdmin, async (req, res) => {

    try {

        const { id } = req.params;

        const { username, balance, balance_recharge, balance_withdraw, user_id_code, linked_account_bank_name, linked_account_number, is_admin } = req.body;



        const result = await pool.query(

            `UPDATE users 

             SET username=$1, balance=$2, balance_recharge=$3, balance_withdraw=$4, 

                 user_id_code=$5, linked_account_bank_name=$6, linked_account_number=$7, is_admin=$8

             WHERE id=$9`,

            [username, balance, balance_recharge, balance_withdraw, user_id_code, linked_account_bank_name, linked_account_number, is_admin ? true : false, id]

        );



        if (result.rowCount === 0) {

            return res.status(404).json({ error: "Usuário não encontrado" });

        }



        res.json({ message: "Usuário atualizado com sucesso" });

    } catch (err) {

        console.error("Erro ao atualizar usuário:", err);

        res.status(500).json({ error: "Erro ao atualizar usuário" });

    }

});









// -------------------- LISTAR DEPÓSITOS --------------------

app.get('/api/admin/deposits', authenticateToken, authenticateAdmin, async (req, res) => {

    try {

        const result = await pool.query(`

            SELECT 

                d.id,

                d.amount,

                d.status,

                d.timestamp,

                d.receipt_filename,

                u.username

            FROM deposits d

            JOIN users u ON d.user_id = u.id

            ORDER BY d.timestamp DESC

        `);



        res.json({ deposits: result.rows });

    } catch (err) {

        console.error('Erro ao buscar depósitos:', err);

        res.status(500).json({ message: 'Erro no servidor' });

    }

});



// -------------------- ATUALIZAR STATUS DEPÓSITO --------------------

// Atualizar depósito (aprovar/rejeitar)

app.put('/api/admin/deposits/:id', authenticateToken, authenticateAdmin, async (req, res) => {

    const { id } = req.params;

    const { status } = req.body;



    try {

        const depositResult = await pool.query(

            'SELECT * FROM deposits WHERE id = $1',

            [id]

        );



        if (depositResult.rows.length === 0) {

            return res.status(404).json({ error: 'Depósito não encontrado' });

        }



        const deposit = depositResult.rows[0];



        await pool.query(

            'UPDATE deposits SET status = $1 WHERE id = $2',

            [status, id]

        );



        // 🔥 Se aprovado, soma no saldo e no saldo de recarga

        if (status === 'Aprovado') {

            const amount = parseFloat(deposit.amount);



            await pool.query(

                `UPDATE users 

                 SET balance_recharge = COALESCE(balance_recharge, 0) + $1,

                     balance = COALESCE(balance, 0) + $1

                 WHERE id = $2`,

                [amount, deposit.user_id]

            );

        }



        res.json({ message: `Depósito ${status} com sucesso.` });

    } catch (err) {

        console.error('Erro ao atualizar depósito:', err);

        res.status(500).json({ error: 'Erro ao atualizar depósito' });

    }

});











// -------------------- LISTAR SAQUES --------------------

// -------------------- LISTAR SAQUES --------------------

app.get('/api/admin/withdrawals', authenticateToken, authenticateAdmin, async (req, res) => {

    try {

        const result = await pool.query(`

            SELECT 

                w.id,

                w.requested_amount,

                w.fee,

                w.actual_amount,

                w.status,

                w.timestamp,

                w.account_number_used,

                u.username

            FROM withdrawals w

            JOIN users u ON w.user_id = u.id

            ORDER BY w.timestamp DESC

        `);



        res.json({ withdrawals: result.rows });

    } catch (err) {

        console.error('Erro ao buscar levantamentos:', err);

        res.status(500).json({ message: 'Erro no servidor' });

    }

});



// -------------------- APROVAR / REJEITAR SAQUE --------------------

// -------------------- APROVAR / REJEITAR SAQUE --------------------

app.put('/api/admin/withdrawals/:id', authenticateToken, authenticateAdmin, async (req, res) => {

    const { id } = req.params;

    const { status } = req.body; // "Aprovado" ou "Rejeitado"



    if (!['Aprovado', 'Rejeitado'].includes(status)) {

        return res.status(400).json({ message: 'Status inválido.' });

    }



    let client;

    try {

        client = await pool.connect();

        await client.query('BEGIN');



        const withdrawalRes = await client.query(

            "SELECT user_id, requested_amount, status AS current_status FROM withdrawals WHERE id = $1",

            [id]

        );



        if (withdrawalRes.rows.length === 0) throw new Error('Saque não encontrado.');

        const { user_id, requested_amount, current_status } = withdrawalRes.rows[0];



        if (current_status !== 'Pendente') throw new Error('Saque já processado.');



        // Atualiza status do saque

        await client.query("UPDATE withdrawals SET status = $1 WHERE id = $2", [status, id]);



        if (status === 'Rejeitado') {

            // devolve o valor para o saldo do usuário

            await client.query(`

                UPDATE users 

                SET balance = COALESCE(balance, 0) + $1, 

                    balance_withdraw = COALESCE(balance_withdraw, 0) + $1 

                WHERE id = $2

            `, [requested_amount, user_id]);

        }



        if (status === 'Aprovado') {

            // 🔥 dá permissão para o usuário criar 1 post no blog

            await client.query(`

                INSERT INTO user_blog_limit (user_id, allowed_posts)

                VALUES ($1, 1)

                ON CONFLICT (user_id) DO UPDATE

                SET allowed_posts = user_blog_limit.allowed_posts + 1

            `, [user_id]);

        }



        await client.query('COMMIT');

        res.status(200).json({ message: `Saque ${status.toLowerCase()} com sucesso.` });

    } catch (err) {

        if (client) await client.query('ROLLBACK');

        console.error('Erro ao processar saque (admin):', err);

        res.status(500).json({ message: 'Erro interno ao processar saque.', error: err.message });

    } finally {

        if (client) client.release();

    }

});



// -------------------- LISTAR PACOTES --------------------

// Criar novo pacote





// Criar novo pacote

app.post('/api/admin/packages', authenticateToken, authenticateAdmin, async (req, res) => {

    const { name, description, min_investment, max_investment, daily_return_rate, duration_days, status } = req.body;



    try {

        const result = await pool.query(

            `INSERT INTO investment_packages 

            (id, name, description, min_investment, max_investment, daily_return_rate, duration_days, status, created_at) 

            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,

            [uuidv4(), name, description, min_investment, max_investment, daily_return_rate, duration_days, status]

        );

        res.json(result.rows[0]);

    } catch (err) {

        console.error('Erro ao adicionar pacote:', err.message);

        res.status(500).json({ error: 'Erro interno ao adicionar pacote' });

    }

});





// Atualizar pacote

app.put('/api/admin/packages/:id', authenticateToken, authenticateAdmin, async (req, res) => {

    try {

        const { id } = req.params;

        const { name, min_investment, max_investment, daily_return_rate, duration_days, status, description } = req.body;



        const result = await pool.query(

            `UPDATE investment_packages 

             SET name=$1, min_investment=$2, max_investment=$3, 

                 daily_return_rate=$4, duration_days=$5, status=$6, description=$7

             WHERE id=$8`,

            [name, min_investment, max_investment, daily_return_rate, duration_days, status, description, id]

        );



        if (result.rowCount === 0) return res.status(404).json({ message: 'Pacote não encontrado.' });

        res.json({ message: 'Pacote atualizado com sucesso.' });

    } catch (err) {

        console.error('Erro ao atualizar pacote:', err);

        res.status(500).json({ message: 'Erro ao atualizar pacote', error: err.message });

    }

});





// Deletar pacote

app.delete('/api/admin/packages/:id', authenticateToken, authenticateAdmin, async (req, res) => {

    try {

        const { id } = req.params;

        const result = await pool.query("DELETE FROM investment_packages WHERE id=$1", [id]);

        if (result.rowCount === 0) return res.status(404).json({ message: 'Pacote não encontrado.' });

        res.json({ message: 'Pacote excluído com sucesso.' });

    } catch (err) {

        console.error('Erro ao excluir pacote:', err);

        res.status(500).json({ message: 'Erro ao excluir pacote', error: err.message });

    }

});

// Listar pacotes

app.get('/api/admin/packages', authenticateToken, authenticateAdmin, async (req, res) => {

    try {

        const result = await pool.query("SELECT * FROM investment_packages ORDER BY created_at DESC NULLS LAST");

        res.status(200).json({ packages: result.rows });

    } catch (err) {

        console.error("Erro ao listar pacotes:", err);

        res.status(500).json({ error: "Erro ao listar pacotes" });

    }

});





// -------------------- GERIR POSTS --------------------



app.get('/api/blog/posts', async (req, res) => {

    try {

        const result = await pool.query(

            `SELECT bp.id, bp.title, bp.content, bp.image_url, bp.published_at, u.username AS author

             FROM blog_posts bp

             JOIN users u ON u.id = bp.author_id

             WHERE bp.is_approved = true

             ORDER BY bp.published_at DESC`

        );

        res.json({ posts: result.rows });

    } catch (err) {

        console.error('Erro ao listar posts aprovados:', err);

        res.status(500).json({ message: 'Erro interno ao listar posts.', error: err.message });

    }

});





app.post('/api/blog/posts', authenticateToken, async (req, res) => {

    let { content, image_url } = req.body;

    const title = "SAQUE"; // título fixo



    // Se o conteúdo estiver vazio, define como null ou string vazia

    if (!content) content = null; // ou content = ""



    try {

        // 1️⃣ Verifica se tem posts disponíveis

        const limitRes = await pool.query(

            "SELECT allowed_posts FROM user_blog_limit WHERE user_id = $1",

            [req.userId]

        );



        if (limitRes.rows.length === 0 || parseInt(limitRes.rows[0].allowed_posts) <= 0) {

            return res.status(403).json({

                message: "Você não tem permissão para postar. Faça um saque aprovado primeiro."

            });

        }



        // 2️⃣ Cria o post

        const postId = uuidv4();

        await pool.query(

            `INSERT INTO blog_posts (id, author_id, title, content, image_url, is_approved, published_at)

             VALUES ($1, $2, $3, $4, $5, false, NOW())`,

            [postId, req.userId, title, content, image_url || null]

        );



        // 3️⃣ Decrementa o contador de posts disponíveis

        await pool.query(

            "UPDATE user_blog_limit SET allowed_posts = allowed_posts - 1 WHERE user_id = $1",

            [req.userId]

        );



        res.status(201).json({ message: 'Post enviado para aprovação do admin.', postId });

    } catch (err) {

        console.error('Erro ao criar post do blog:', err);

        res.status(500).json({ message: 'Erro interno ao criar post.', error: err.message });

    }

});



app.put('/api/admin/blog/posts/:id', authenticateToken, authenticateAdmin, async (req, res) => {

    const { id } = req.params;

    const { is_approved } = req.body;



    if (typeof is_approved !== 'boolean') return res.status(400).json({ message: 'is_approved deve ser true ou false' });



    try {

        const result = await pool.query(

            "UPDATE blog_posts SET is_approved = $1 WHERE id = $2 RETURNING *",

            [is_approved, id]

        );

        if (result.rowCount === 0) return res.status(404).json({ message: 'Post não encontrado.' });



        res.json({ message: `Post ${is_approved ? 'aprovado' : 'rejeitado'} com sucesso.` });

    } catch (err) {

        console.error('Erro ao aprovar/rejeitar post:', err);

        res.status(500).json({ message: 'Erro interno.', error: err.message });

    }

});

// GET posts para admin

app.get('/api/admin/blog/posts', authenticateToken, authenticateAdmin, async (req, res) => {

    try {

        const result = await pool.query(

            `SELECT bp.id, bp.title, bp.content, bp.image_url, bp.published_at, bp.is_approved, u.username AS author

             FROM blog_posts bp

             JOIN users u ON u.id = bp.author_id

             ORDER BY bp.published_at DESC`

        );

        res.json({ posts: result.rows });

    } catch (err) {

        console.error('Erro ao listar posts (admin):', err);

        res.status(500).json({ message: 'Erro interno ao listar posts.', error: err.message });

    }

});







// -------------------- JOB DE CRÉDITO DIÁRIO --------------------

async function processDailyEarnings() {

    const client = await pool.connect();

    try {

        await client.query('BEGIN');



        // Buscar todos investimentos ativos

        const result = await client.query(

            `SELECT ui.id, ui.user_id, ui.daily_earning, ui.days_remaining

             FROM user_investments ui

             WHERE ui.status = 'ativo'`

        );



        for (const inv of result.rows) {

            if (inv.days_remaining > 0) {

                // Credita no saldo de saque

                await client.query(

                    `UPDATE users 

                     SET balance_withdraw = balance_withdraw + $1,

                         balance = balance + $1

                     WHERE id = $2`,

                    [inv.daily_earning, inv.user_id]

                );



                // Atualiza investimento

                await client.query(

                    `UPDATE user_investments

                     SET days_remaining = days_remaining - 1,

                         status = CASE WHEN days_remaining - 1 <= 0 THEN 'concluido' ELSE status END

                     WHERE id = $1`,

                    [inv.id]

                );



                console.log(`💰 Crédito de Kz ${inv.daily_earning} para user ${inv.user_id}`);

            }

        }



        await client.query('COMMIT');

    } catch (err) {

        await client.query('ROLLBACK');

        console.error("Erro ao processar ganhos diários:", err);

    } finally {

        client.release();

    }

}



// 🔥 Endpoint manual (admin chama para rodar o job)

app.post('/api/admin/process-earnings', authenticateToken, authenticateAdmin, async (req, res) => {

    await processDailyEarnings();

    res.json({ message: "Processamento de ganhos concluído." });

});









// ==============================================================================

// INICIAR O SERVIDOR

// ==============================================================================

app.listen(PORT, '0.0.0.0', () => {

    console.log(`Servidor Node.js a correr em http://localhost:${PORT}`);

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

    console.log(`- Rotas admin disponíveis (usuários, depósitos, saques, pacotes, posts)`);

    console.log(`- Servindo ficheiros estáticos da pasta frontend/`);

});

