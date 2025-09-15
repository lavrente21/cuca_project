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
const cron = require("node-cron");
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

function generateUserIdCode() {
    // Gera um código curto aleatório (ex: X123)
    return 'X' + Math.floor(100 + Math.random() * 900);
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
        // Gera número de 9 dígitos
        code = String(Math.floor(100000000 + Math.random() * 900000000)); 
        const res = await pool.query(
            "SELECT COUNT(*) AS count FROM users WHERE user_id_code = $1",
            [code]
        );
        rows = res.rows;
    } while (parseInt(rows[0].count, 10) > 0);
    return code;
}



// Middleware de autenticação
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).send("ERRO DE AUTENTICAÇÃO: Token não fornecido.");
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error("ERRO DE AUTENTICAÇÃO:", err.name, err.message);
            return res.status(403).send("ERRO DE AUTENTICAÇÃO: Token inválido.");
        }

        console.log("Token verificado! Payload (req.user):", user);
        req.user = user;
         req.userId = user.id;  // <-- adiciona isto

        next();
    });
}

// ✅ Defina só uma vez
const authenticateAdmin = async (req, res, next) => {
    try {
        const result = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.user.id]);
        if (!result.rows[0] || !result.rows[0].is_admin) {
            return res.status(403).json({ message: 'Acesso negado: Admin apenas.' });
        }
        next();
    } catch (err) {
        console.error('Erro ao autenticar admin:', err);
        res.status(500).json({ message: 'Erro interno ao verificar admin.' });
    }
};

async function generateUserIdCode() {
    let code;
    let exists = true;
    while (exists) {
        code = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 caracteres
        const result = await pool.query("SELECT id FROM users WHERE user_id_code = $1", [code]);
        if (result.rows.length === 0) exists = false;
    }
    return code;
}

// ==============================================================================
// ROTAS DO BACKEND (ENDPOINTS DA API)
// ==============================================================================

// -------------------- REGISTRO --------------------
app.post('/api/register', async (req, res) => {
    const { username, password, transactionPassword, referralCode } = req.body;

    if (!username || !password || !transactionPassword) {
        return res.status(400).json({ message: 'Por favor, preencha todos os campos obrigatórios.' });
    }

    try {
        // Verifica se o username já existe
        const existing = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ message: 'Nome de utilizador já existe.' });
        }

        // Verifica se o referralCode é válido
        let referredById = null;
        if (referralCode) {
            console.log("📩 referralCode recebido do frontend:", referralCode);

            const refResult = await pool.query(
                `SELECT id, username, user_id_code 
                 FROM users 
                 WHERE user_id_code = $1 OR username = $1`,
                [referralCode]
            );

            console.log("🔎 Resultado da busca no banco:", refResult.rows);

            if (refResult.rows.length > 0) {
                referredById = refResult.rows[0].id;
                console.log(`✅ referralCode válido → Dono: ${refResult.rows[0].username} | ID: ${referredById}`);
            } else {
                console.log("⚠️ Nenhum usuário encontrado com esse referralCode:", referralCode);
                return res.status(400).json({ message: "Código de referral inválido." });
            }
        }
     console.log("➡️ referralCode recebido:", referralCode);
console.log("➡️ referredById resolvido:", referredById);


        // Gera o código único do usuário
        const userIdCode = await generateUserIdCode();
        const userId = uuidv4();
        const passwordHash = await bcrypt.hash(password, 10);
        const transactionPasswordHash = await bcrypt.hash(transactionPassword, 10);

        const sql = `
            INSERT INTO users
            (id, username, password_hash, transaction_password_hash, balance, balance_recharge, balance_withdraw, user_id_code, referred_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        await pool.query(sql, [
            userId,
            username,
            passwordHash,
            transactionPasswordHash,
            0.0, 0.0, 0.0,
            userIdCode,
            referredById
        ]);

        console.log(`✅ Utilizador registado: ${username} | NovoID: ${userId} | user_id_code: ${userIdCode} | ReferredBy: ${referredById}`);
        res.status(201).json({
            message: 'Cadastro realizado com sucesso!',
            userId: userId,
            userIdCode: userIdCode,
            referredBy: referredById
        });

    } catch (err) {
        console.error('❌ Erro no registo de utilizador:', err);
        res.status(500).json({
            message: 'Erro interno do servidor ao registar utilizador.',
            error: err.message
        });
    }
});



// -------------------- LOGIN --------------------
// Linha 181 do seu ficheiro server.js
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query(
            'SELECT id, username, password_hash, user_id_code, is_admin FROM users WHERE username = $1',
            [username]
        );
        const user = result.rows[0];

        if (user && await bcrypt.compare(password, user.password_hash)) {
            // Converta user.is_admin para um booleano explícito
            const isAdmin = user.is_admin === true || user.is_admin === "verdadeiro" || user.is_admin === 1;

            // Cria o JWT
            const token = jwt.sign(
                { id: user.id, isAdmin: isAdmin },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Retorna todos os dados esperados pelo frontend
            res.json({
                token,
                username: user.username,
                userId: user.id,
                userIdCode: user.user_id_code, // <-- referral code
                isAdmin
            });
        } else {
            res.status(401).json({ message: 'Credenciais inválidas.' });
        }
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ message: 'Erro interno do servidor.' });
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
        const client = await pool.connect();
        const result = await client.query(
            "SELECT username, user_id_code, balance, balance_recharge, balance_withdraw, linked_account_bank_name, linked_account_number, linked_account_holder FROM users WHERE id = $1",
            [req.user.id] // << CORRIGIDO
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
        // Move o arquivo enviado para a pasta de uploads
        await fs.promises.rename(file.path, filepath);

        // Inicia transação
        client = await pool.connect();
        await client.query('BEGIN');

        // Salva depósito como "Pendente"
        const depositId = uuidv4();
        const sqlDeposit = `
            INSERT INTO deposits (id, user_id, amount, status, timestamp, receipt_filename)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await client.query(sqlDeposit, [depositId, req.userId, amount, 'Pendente', new Date(), filename]);

        // Dar comissão ao indicador (referral)
        const userRes = await client.query("SELECT referred_by FROM users WHERE id = $1", [req.userId]);
        const referredById = userRes.rows[0]?.referred_by;

        if (referredById) {
            const commission = amount * 0.10; // 10%
            await client.query(
                "UPDATE users SET balance_withdraw = balance_withdraw + $1 WHERE id = $2",
                [commission, referredById]
            );
        }

        // Confirma transação
        await client.query('COMMIT');

        console.log(`Depósito de Kz ${amount} registado para o utilizador ${req.userId}, aguardando aprovação do admin.`);
        res.status(200).json({
            message: 'Depósito enviado para análise do administrador. O saldo será atualizado após aprovação.'
        });
    } catch (err) {
        // Rollback em caso de erro
        if (client) {
            try { await client.query('ROLLBACK'); } catch (e) { /* ignora */ }
        }
        console.error('Erro no depósito:', err);
        res.status(500).json({
            error: 'Erro interno do servidor ao processar depósito.',
            message: err.message
        });
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
            "SELECT id, name, type, daily_return_rate, duration_days, min_investment, max_investment, status FROM investment_packages WHERE id = $1",
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
        const userRes = await client.query(
            "SELECT balance_recharge FROM users WHERE id = $1 FOR UPDATE",
            [req.userId]
        );
        const user = userRes.rows[0];
        if (!user) throw new Error("Usuário não encontrado.");
        if (parseFloat(user.balance_recharge) < amount) throw new Error("Saldo de recarga insuficiente.");

        // 4) Regras especiais
        if (pkg.type === "curto") {
            // já comprou esse curto antes?
            const alreadyBought = await client.query(
                "SELECT id FROM user_investments WHERE user_id = $1 AND package_id = $2",
                [req.userId, pkg.id]
            );
            if (alreadyBought.rows.length > 0) {
                throw new Error(`Você só pode comprar o pacote ${pkg.name} (curto) uma única vez.`);
            }

            // precisa ter o mesmo pacote longo ativo
            // remove "(VIP)" ou "VIP" do final do nome para comparar
            const baseName = pkg.name.replace(/\s*\(?vip\)?\s*$/i, '').trim();

            const hasLong = await client.query(
                `SELECT ui.id
                 FROM user_investments ui
                 JOIN investment_packages ip ON ui.package_id = ip.id
                 WHERE ui.user_id = $1
                   AND ip.name = $2
                   AND ip.type = 'longo'
                   AND ui.status = 'ativo'`,
                [req.userId, baseName]
            );
            if (hasLong.rows.length === 0) {
                throw new Error(`Para adquirir o pacote ${pkg.name} (curto), você precisa ter ativo o pacote ${baseName} (longo).`);
            }
        }

        // (se for longo, pode comprar sempre, sem restrições)

        // 5) Calcula ganho diário
        const dailyEarning = parseFloat((amount * (parseFloat(pkg.daily_return_rate) / 100)).toFixed(2));

        // 6) Inserir investimento
        const investmentId = uuidv4();
        await client.query(
            `INSERT INTO user_investments
             (id, user_id, package_id, package_name, amount, daily_earning, days_remaining, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [investmentId, req.userId, packageId, pkg.name, amount, dailyEarning, pkg.duration_days, 'ativo']
        );

        // 7) Desconta apenas do balance_recharge
        await client.query(
            "UPDATE users SET balance_recharge = balance_recharge - $1 WHERE id = $2",
            [amount, req.userId]
        );

        await client.query('COMMIT');
        res.status(200).json({ message: 'Investimento criado com sucesso!', investmentId });

    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
        console.error('Erro ao criar investimento:', err);

        if (!res.headersSent) {
            res.status(400).json({
                success: false,
                message: err.message || 'Erro ao criar investimento.'
            });
        }
    } finally {
        client.release();
    }
});

// Rota para listar pacotes ativos do usuário
app.get('/api/user/active-packages', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ui.id, ui.package_id, ui.package_name, ip.type, ui.status, ui.amount, ui.days_remaining
             FROM user_investments ui
             JOIN investment_packages ip ON ui.package_id = ip.id
             WHERE ui.user_id = $1 AND ui.status = 'ativo'`,
            [req.userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Erro ao buscar pacotes ativos:", err);
        res.status(500).json({ message: "Erro ao buscar pacotes ativos." });
    }
});


// Rota de Levantamento (Withdraw)
// Rota de Levantamento (Withdraw)
// Rota de Levantamento (Withdraw)
app.post('/api/withdraw', authenticateToken, async (req, res) => {
    const { withdrawAmount, transactionPassword } = req.body;
    const userId = req.user.id;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Validar o valor
        if (!withdrawAmount || isNaN(withdrawAmount) || withdrawAmount <= 0) {
            return res.status(400).json({ message: "Valor inválido para levantamento." });
        }
        // **NOVA VALIDAÇÃO AQUI**
        const MIN_WITHDRAW_AMOUNT = 1200;
        if (withdrawAmount < MIN_WITHDRAW_AMOUNT) {
            return res.status(400).json({ message: `O valor mínimo para levantamento é Kz ${MIN_WITHDRAW_AMOUNT.toFixed(2).replace('.', ',')}.` });
        }

        // 2. Obter saldo do usuário
        const userRes = await client.query('SELECT balance_withdraw FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];

        if (!user) {
            return res.status(404).json({ message: "Usuário não encontrado." });
        }

        // 3. Verificar se o saldo é suficiente
        if (user.balance_withdraw < withdrawAmount) {
            return res.status(400).json({ message: "Saldo insuficiente para o levantamento." });
        }

        // 4. Obter a senha de transação para validação
        const transactionPasswordRes = await client.query('SELECT transaction_password_hash FROM users WHERE id = $1', [userId]);
        const transactionPasswordHash = transactionPasswordRes.rows[0].transaction_password_hash;

        if (!transactionPasswordHash || !(await bcrypt.compare(transactionPassword, transactionPasswordHash))) {
             return res.status(401).json({ message: "Senha de transação incorreta." });
        }

        // 5. Calcular a taxa e o valor final
        const WITHDRAW_FEE_PERCENTAGE = 0.05;
        const fee = parseFloat((withdrawAmount * WITHDRAW_FEE_PERCENTAGE).toFixed(2));
        const actualAmount = parseFloat((withdrawAmount - fee).toFixed(2));

        // 6. Atualizar o saldo do usuário
        const newBalance = parseFloat((user.balance_withdraw - withdrawAmount).toFixed(2));
        await client.query('UPDATE users SET balance_withdraw = $1 WHERE id = $2', [newBalance, userId]);

        // 7. Obter o número da conta vinculada
        const linkedAccountRes = await client.query(
            "SELECT linked_account_number FROM users WHERE id = $1",
            [userId]
        );
        const linkedAccountNumber = linkedAccountRes.rows[0]?.linked_account_number;

        // 8. Registrar o pedido de levantamento
     await client.query(
    `INSERT INTO withdrawals (id, user_id, requested_amount, fee, actual_amount, status, account_number_used, timestamp) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [uuidv4(), userId, withdrawAmount, fee, actualAmount, 'Pendente', linkedAccountNumber]
);
        await client.query('COMMIT');
        res.json({ message: 'Pedido de levantamento registado com sucesso. Aguardando aprovação.' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erro no levantamento:', err);
        res.status(500).json({ message: 'Erro inesperado no servidor. Por favor, tente novamente.' });
    } finally {
        client.release();
    }
});
// -------------------- INVESTIMENTOS DO USUÁRIO --------------------
app.get('/api/investments/active', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const investmentsRes = await client.query(
            `SELECT id, amount, daily_earning, days_remaining, created_at, status
             FROM user_investments
             WHERE user_id = $1 AND status = 'ativo'`,
            [req.userId]
        );

        for (const inv of investmentsRes.rows) {
            const now = new Date();
            const createdAt = new Date(inv.created_at);
            const daysPassed = Math.floor((now - createdAt) / 86400000);
            const totalDays = inv.days_remaining;

            // Quantos dias já deviam ter sido pagos
            const daysToCredit = Math.min(daysPassed, totalDays);

            // Quantos já foram pagos
            const alreadyPaidRes = await client.query(
                "SELECT COUNT(*) FROM investment_earnings WHERE investment_id = $1",
                [inv.id]
            );
            const alreadyPaid = parseInt(alreadyPaidRes.rows[0].count, 10);

            if (daysToCredit > alreadyPaid) {
                const newPayments = daysToCredit - alreadyPaid;
                const totalCredit = inv.daily_earning * newPayments;

                // Atualiza saldo de saque
                await client.query(
                    "UPDATE users SET balance_withdraw = balance_withdraw + $1 WHERE id = $2",
                    [totalCredit, req.userId]
                );

                // Registra cada ganho
                for (let i = 0; i < newPayments; i++) {
                    await client.query(
                        "INSERT INTO investment_earnings (id, investment_id, amount, paid_at) VALUES ($1, $2, $3, NOW())",
                        [uuidv4(), inv.id, inv.daily_earning]
                    );
                }
            }
        }

        await client.query('COMMIT');

        // Retorna os investimentos
        const result = await client.query(
            `SELECT ui.id, ui.package_id, ip.name AS package_name, ui.amount,
                    ui.daily_earning, ui.days_remaining, ui.status, ui.created_at
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
        await client.query('ROLLBACK');
        console.error('Erro ao buscar investimentos ativos do usuário:', err);
        res.status(500).json({ message: 'Erro interno ao obter investimentos.', error: err.message });
    } finally {
        client.release();
    }
});




// -------------------- LISTAR PACOTES (PÚBLICO/FRONTEND) --------------------
app.get('/api/packages', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, name, description, min_investment, max_investment, daily_return_rate, duration_days, status, type FROM investment_packages WHERE status = 'Ativo' ORDER BY created_at DESC"
        );

        const curto = result.rows.filter(p => p.type === 'curto');
        const longo = result.rows.filter(p => p.type === 'longo');

        res.status(200).json({ curto, longo });
    } catch (err) {
        console.error("Erro ao listar pacotes:", err);
        res.status(500).json({ error: "Erro ao listar pacotes" });
    }
});


// -------------------- HISTÓRICOS --------------------

// Histórico de Saques
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
    }
});

// Histórico de Depósitos
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

// Histórico de Investimentos e Ganhos
app.get('/api/investments/history', authenticateToken, async (req, res) => {
    try {
        const investmentsResult = await pool.query(
            `SELECT ui.id,
                    ui.amount,
                    ui.daily_earning,
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

        const earningsResult = await pool.query(
            `SELECT ie.amount, ie.paid_at, p.name AS package_name, p.daily_return_rate
             FROM investment_earnings ie
             JOIN user_investments ui ON ie.investment_id = ui.id
             JOIN investment_packages p ON ui.package_id = p.id
             WHERE ui.user_id = $1
             ORDER BY ie.paid_at DESC`,
            [req.userId]
        );

        const history = [];

        investmentsResult.rows.forEach(row => {
            history.push({
                id: row.id,
                type: 'investment',
                amount: parseFloat(row.amount),
                packageName: row.package_name,
                roi: `${row.daily_return_rate}% por ${row.duration_days} dias`,
                status: row.status,
                timestamp: row.created_at
            });
        });

        earningsResult.rows.forEach(earning => {
            history.push({
                id: `earning-${earning.paid_at.getTime()}-${Math.random()}`,
                type: 'earning',
                amount: parseFloat(earning.amount),
                packageName: earning.package_name,
                roi: `Retorno diário (${earning.daily_return_rate}%)`,
                status: 'Pago',
                timestamp: earning.paid_at
            });
        });

        history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({ history });
    } catch (err) {
        console.error("Erro ao buscar histórico de investimentos:", err);
        res.status(500).json({ message: "Erro ao buscar histórico de investimentos." });
    }
});; 
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
        // 1️⃣ Busca saques do usuário
        const result = await pool.query(
            `SELECT requested_amount, fee, actual_amount, status, timestamp, account_number_used 
             FROM withdrawals 
             WHERE user_id = $1 
             ORDER BY timestamp DESC`,
            [req.userId]
        );

        // 2️⃣ Busca investimentos ativos do usuário
        const investmentsRes = await pool.query(
            `SELECT id, daily_earning, duration_days, created_at
             FROM user_investments
             WHERE user_id = $1 AND status = 'ativo'`,
            [req.userId]
        );

        for (const row of investmentsRes.rows) {
            const now = new Date();
            const createdAt = new Date(row.created_at);

            const daysPassed = Math.floor((now - createdAt) / 86400000);
            const daysToCredit = Math.min(daysPassed, row.duration_days);

            // Conta quantos dias já foram pagos
            const alreadyPaidRes = await pool.query(
                "SELECT COUNT(*) FROM investment_earnings WHERE investment_id = $1",
                [row.id]
            );
            const alreadyPaid = parseInt(alreadyPaidRes.rows[0].count, 10);

            // Credita novos dias se houver
            if (daysToCredit > alreadyPaid) {
                const newPayments = daysToCredit - alreadyPaid;

                await pool.query(
                    "UPDATE users SET balance_withdraw = balance_withdraw + $1 WHERE id = $2",
                    [row.daily_earning * newPayments, req.userId]
                );

                // Salva os pagamentos
                for (let i = alreadyPaid; i < daysToCredit; i++) {
                    await pool.query(
                        "INSERT INTO investment_earnings (id, investment_id, amount, paid_at) VALUES ($1, $2, $3, NOW())",
                        [uuidv4(), row.id, row.daily_earning]
                    );
                }
            }
        }

        // 3️⃣ Monta histórico de saques
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
        res.status(500).json({ 
            error: 'Erro interno do servidor ao carregar histórico.', 
            message: err.message 
        });
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
     // 🔥 Paga comissão de 10% para quem indicou
const userRes = await pool.query("SELECT referred_by FROM users WHERE id = $1", [deposit.user_id]);
const referredBy = userRes.rows[0].referred_by;

if (referredBy) {
    const commission = parseFloat(deposit.amount) * 0.10; // 10%
    await pool.query(
        `UPDATE users
         SET balance = COALESCE(balance, 0) + $1
         WHERE id = $2`,
        [commission, referredBy]
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
    const { name, description, min_investment, max_investment, daily_return_rate, duration_days, status, type } = req.body;

    try {
        const result = await pool.query(
    `INSERT INTO investment_packages 
    (id, name, description, min_investment, max_investment, daily_return_rate, duration_days, status, type, created_at) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
    [uuidv4(), name, description, min_investment, max_investment, daily_return_rate, duration_days, status, type || 'curto']
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
         daily_return_rate=$4, duration_days=$5, status=$6, description=$7, type=$8
     WHERE id=$9`,
    [name, min_investment, max_investment, daily_return_rate, duration_days, status, description, type || 'curto', id]
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


app.post('/api/blog/posts', authenticateToken, upload.single("img"), async (req, res) => {
    let { content } = req.body;
    const title = "SAQUE"; 
    const image_url = req.file ? `/uploads/${req.file.filename}` : null; // caminho acessível da imagem

    if (!content) content = null;

    try {
        // verificar se usuário tem permissão
        const limitRes = await pool.query(
            "SELECT allowed_posts FROM user_blog_limit WHERE user_id = $1",
            [req.userId]
        );

        if (limitRes.rows.length === 0 || parseInt(limitRes.rows[0].allowed_posts) <= 0) {
            return res.status(403).json({
                message: "Você não tem permissão para postar. Faça um saque aprovado primeiro."
            });
        }

        // criar post
        const postId = uuidv4();
        await pool.query(
            `INSERT INTO blog_posts (id, author_id, title, content, image_url, is_approved, published_at)
             VALUES ($1, $2, $3, $4, $5, false, NOW())`,
            [postId, req.userId, title, content, image_url]
        );

        // decrementa limite
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
// Função para processar e creditar ganhos diários nos investimentos ativos
// Função para processar e creditar ganhos diários nos investimentos ativos
// -------------------- JOB DE CRÉDITO DIÁRIO --------------------
async function processDailyEarnings() {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Busca apenas investimentos que estão ativos e passaram 24h do último crédito (ou da criação)
        const activeInvestmentsQuery = `
            SELECT id, user_id, amount, daily_earning, days_remaining, created_at, last_credited_at
            FROM user_investments
            WHERE status = 'ativo'
            AND (
                (last_credited_at IS NULL AND created_at <= NOW() - INTERVAL '24 hours')
                OR (last_credited_at IS NOT NULL AND last_credited_at <= NOW() - INTERVAL '24 hours')
            );
        `;
        const investmentsResult = await client.query(activeInvestmentsQuery);
        const activeInvestments = investmentsResult.rows;

        for (const inv of activeInvestments) {
            // Credita o ganho diário ao usuário
            await client.query(`
                UPDATE users
                SET balance = balance + $1,
                    balance_withdraw = balance_withdraw + $1
                WHERE id = $2;
            `, [inv.daily_earning, inv.user_id]);

            // Registra o ganho no histórico
            const earningId = uuidv4();
            await client.query(`
                INSERT INTO investment_earnings (id, investment_id, amount, paid_at)
                VALUES ($1, $2, $3, NOW());
            `, [earningId, inv.id, inv.daily_earning]);

            // Atualiza dias restantes, último crédito e status
            await client.query(`
                UPDATE user_investments
                SET days_remaining = days_remaining - 1,
                    last_credited_at = NOW(),
                    status = CASE WHEN days_remaining - 1 <= 0 THEN 'concluido' ELSE status END
                WHERE id = $1;
            `, [inv.id]);

            console.log(`💰 Crédito de Kz ${inv.daily_earning} para o usuário ${inv.user_id}`);
        }

        await client.query('COMMIT');
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ Erro ao processar ganhos diários:", err);
    } finally {
        if (client) client.release();
    }
}

// -------------------- CRON JOB --------------------
// executa a cada minuto (pode ajustar para cada hora ou a cada dia se preferir)
cron.schedule('* * * * *', processDailyEarnings);




app.get('/api/referrals', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id,
                u.username,
                COALESCE(SUM(d.amount), 0) AS total_deposit,
                COUNT(d.id) AS num_deposits,
                SUM(CASE WHEN d.status = 'Aprovado' THEN d.amount * 0.10 ELSE 0 END) AS total_commission_earned
            FROM users u
            LEFT JOIN deposits d ON u.id = d.user_id
            WHERE u.referred_by = $1
            GROUP BY u.id, u.username
            ORDER BY total_deposit DESC
        `, [req.userId]);

        res.json({ referrals: result.rows });
    } catch (err) {
        console.error('Erro ao buscar referrals:', err);
        res.status(500).json({ error: 'Erro interno ao buscar referrals.' });
    }
});

// /api/team/stats
app.get('/api/team/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId; // ✅ aqui agora

        // ===== NÍVEL 1 =====
        const nivel1 = await pool.query(
            `SELECT id FROM users WHERE referred_by = $1`,
            [userId]
        );
        const nivel1Ids = nivel1.rows.map(r => r.id);

        const nivel1Active = await pool.query(
            `SELECT DISTINCT u.id
             FROM users u
             JOIN user_investments i ON i.user_id = u.id
             WHERE u.referred_by = $1 AND i.status = 'ativo'`,
            [userId]
        );

        // ===== NÍVEL 2 =====
        let nivel2Ids = [];
        let nivel2ActiveCount = 0;
        if (nivel1Ids.length > 0) {
            const nivel2 = await pool.query(
                `SELECT id FROM users WHERE referred_by = ANY($1::uuid[])`,
                [nivel1Ids]
            );
            nivel2Ids = nivel2.rows.map(r => r.id);

            const nivel2Active = await pool.query(
                `SELECT DISTINCT u.id
                 FROM users u
                 JOIN user_investments i ON i.user_id = u.id
                 WHERE u.referred_by = ANY($1::uuid[]) AND i.status = 'ativo'`,
                [nivel1Ids]
            );
            nivel2ActiveCount = nivel2Active.rowCount;
        }

        // ===== NÍVEL 3 =====
        let nivel3Ids = [];
        let nivel3ActiveCount = 0;
        if (nivel2Ids.length > 0) {
            const nivel3 = await pool.query(
                `SELECT id FROM users WHERE referred_by = ANY($1::uuid[])`,
                [nivel2Ids]
            );
            nivel3Ids = nivel3.rows.map(r => r.id);

            const nivel3Active = await pool.query(
                `SELECT DISTINCT u.id
                 FROM users u
                 JOIN user_investments i ON i.user_id = u.id
                 WHERE u.referred_by = ANY($1::uuid[]) AND i.status = 'ativo'`,
                [nivel2Ids]
            );
            nivel3ActiveCount = nivel3Active.rowCount;
        }

        res.json({
            nivel1: {
                total: nivel1.rowCount,
                ativos: nivel1Active.rowCount
            },
            nivel2: {
                total: nivel2Ids.length,
                ativos: nivel2ActiveCount
            },
            nivel3: {
                total: nivel3Ids.length,
                ativos: nivel3ActiveCount
            }
        });

    } catch (err) {
        console.error("❌ Erro ao buscar estatísticas da equipe:", err);
        res.status(500).json({ error: "Erro ao buscar estatísticas da equipe" });
    }
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
