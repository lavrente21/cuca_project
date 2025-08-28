// frontend/static/js/session.js
// Lida com toda a lógica de gestão de sessão: proteção de páginas, redirecionamento e logout.

import { showMessage, showLoading } from './utils.js';

/**
 * Redireciona para a página de login se o utilizador não estiver autenticado.
 * Deve ser chamado em páginas que exigem autenticação (dashboard, investimentos, etc.).
 */
export function protectPage() {
    console.log("session.js: protectPage() a ser executado.");
    const userToken = localStorage.getItem('userToken');
    const username = localStorage.getItem('username');

    if (!userToken || !username) {
        console.log("session.js: protectPage(): Token ou Username ausente. Redirecionando para /Login.html");
        localStorage.clear(); // Limpa qualquer token/username parcial
        showMessage('Acesso negado. Por favor, faça login.', 1500);
        setTimeout(() => {
            window.location.href = '/Login.html'; // Caminho absoluto
        }, 1500);
    } else {
        console.log(`session.js: protectPage(): Token encontrado (valor: ${userToken.substring(0,10)}...), Username encontrado. Acesso concedido.`);
    }
}

/**
 * Redireciona para o dashboard se o utilizador já estiver autenticado.
 * Deve ser chamado nas páginas de login e cadastro para evitar que o utilizador
 * acesse essas páginas estando já logado.
 */
export function redirectIfLoggedIn() {
    console.log("session.js: redirectIfLoggedIn() a ser executado.");
    const userToken = localStorage.getItem('userToken');
    const username = localStorage.getItem('username');

    if (userToken && username) { // Verifica ambos para consistência
        console.log(`session.js: redirectIfLoggedIn(): Token e Username encontrados. Redirecionando para /Pagina inicial.html`);
        showMessage('Já estás logado(a). Redirecionando para a página inicial...', 1500);
        setTimeout(() => {
            window.location.href = '/Pagina inicial.html'; // Caminho absoluto
        }, 1500);
    } else {
        console.log("session.js: redirectIfLoggedIn(): Token ou Username ausente. Permanecendo na página de login/registro.");
        // Opcional: Limpar localStorage se apenas um deles estiver presente, indicando inconsistência
        if (userToken || username) {
            localStorage.clear();
            console.warn("session.js: redirectIfLoggedIn(): Estado de localStorage inconsistente, foi limpo.");
        }
    }
}

/**
 * Configura o event listener para o botão de terminar sessão.
 * Limpa o localStorage e redireciona para a página de login.
 * @param {string} buttonId - O ID do botão de terminar sessão no HTML.
 */
export function setupLogoutButton(buttonId = 'logout-button') {
    const logoutButton = document.getElementById(buttonId);
    if (logoutButton) {
        logoutButton.addEventListener('click', async (event) => {
            event.preventDefault(); // Evita o comportamento padrão do link

            showLoading(true);
            try {
                const userToken = localStorage.getItem('userToken');
                if (!userToken) {
                    console.warn("session.js: setupLogoutButton(): Tentativa de logout sem token. Limpando e redirecionando.");
                    localStorage.clear();
                    showMessage('Não está logado. Redirecionando...', 1500);
                    setTimeout(() => { window.location.href = '/Login.html'; }, 1500);
                    return;
                }

                console.log("session.js: setupLogoutButton(): A fazer requisição de logout para o backend.");
                const response = await fetch('http://localhost:5000/api/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${userToken}`
                    }
                });
                const data = await response.json();
                console.log("session.js: setupLogoutButton(): Resposta do logout:", response.status, data);

                if (response.ok) {
                    localStorage.clear(); // Limpa todos os dados da sessão
                    showMessage('Logout bem-sucedido. Redirecionando...', 1500);
                    setTimeout(() => {
                        window.location.href = '/Login.html'; // Caminho absoluto
                    }, 1500);
                } else {
                    console.error("session.js: setupLogoutButton(): Erro ao fazer logout no backend:", data.message);
                    showMessage('Erro ao fazer logout: ' + (data.message || 'Erro desconhecido.'), 2000);
                    // Mesmo com erro do backend, para o utilizador, o token no frontend não é mais útil
                    localStorage.clear();
                    setTimeout(() => { window.location.href = '/Login.html'; }, 1500);
                }
            } catch (error) {
                console.error('session.js: setupLogoutButton(): Erro de rede ao fazer logout:', error);
                showMessage('Não foi possível conectar ao servidor para logout.', 2000);
                localStorage.clear(); // Garante que o estado local é limpo mesmo com erro de rede
                setTimeout(() => { window.location.href = '/Login.html'; }, 1500);
            } finally {
                showLoading(false);
            }
        });
    } else {
        console.warn(`session.js: Botão de logout com ID '${buttonId}' não encontrado.`);
    }
}

// Centraliza a lógica de proteção/redirecionamento no DOMContentLoaded aqui para login/registro
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path.includes('Login.html') || path.includes('Registro.html') || path === '/') {
        redirectIfLoggedIn();
    }
    // Para outras páginas que precisam de protectPage(), a chamada deve estar no JS específico delas.
});
