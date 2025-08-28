// frontend/static/js/pageSpecific-registro.js
// Lógica específica para a página de registo (Registro.html)

import { showMessage, showLoading } from './utils.js';
import { redirectIfLoggedIn } from '../js/session.js';

console.log("pageSpecific-registro.js: Script a ser carregado.");

// Redireciona para a página inicial se o utilizador já estiver logado
redirectIfLoggedIn();

document.addEventListener('DOMContentLoaded', () => {
    console.log("pageSpecific-registro.js: DOMContentLoaded disparado. Tentando configurar o listener do formulário.");

    const registerForm = document.getElementById('register-form');
    const registerButton = document.getElementById('register-btn');

    if (registerForm && registerButton) {
        console.log("pageSpecific-registro.js: Formulário e botão de registo encontrados. A configurar listener 'submit'.");
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Impede o comportamento padrão de submissão do formulário
            console.log("pageSpecific-registro.js: Evento 'submit' do formulário de registo disparado.");

            showLoading(true); // Mostra o indicador de carregamento

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const transactionPassword = document.getElementById('transaction-password').value;

            // Validação simples no frontend
            if (!username || !password || !transactionPassword) {
                console.warn("pageSpecific-registro.js: Campos vazios detectados.");
                showMessage('Por favor, preencha todos os campos.', 2000);
                showLoading(false);
                return;
            }

            console.log(`pageSpecific-registro.js: Dados do formulário: Username=${username}, PasswordLength=${password.length}, TransactionPasswordLength=${transactionPassword.length}`);

            try {
                console.log("pageSpecific-registro.js: A enviar requisição POST para /api/register...");
                const response = await fetch('http://localhost:5000/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password, transactionPassword }),
                });

                const data = await response.json();
                console.log("pageSpecific-registro.js: Resposta do backend de registo recebida:", response.status, data);

                if (response.ok) { // Status 2xx (ex: 201 Created)
                    showMessage('Cadastro realizado com sucesso! Redirecionando para o login...', false, 2000);
                    // Após o registo bem-sucedido, redireciona para a página de login
                    setTimeout(() => {
                        window.location.href = '/Login.html';
                    }, 2000);
                } else {
                    console.error("pageSpecific-registro.js: Erro do backend no registo:", data.message || "Erro desconhecido.");
                    showMessage(data.message || 'Erro no cadastro. Tente novamente.', 2000);
                }
            } catch (error) {
                console.error('pageSpecific-registro.js: Erro de rede ou servidor ao registar:', error);
                showMessage('Não foi possível conectar ao servidor. Verifique a sua conexão ou tente novamente mais tarde.', 3000);
            } finally {
                showLoading(false); // Esconde o indicador de carregamento
                console.log("pageSpecific-registro.js: Processo de registo finalizado.");
            }
        });
    } else {
        console.error("pageSpecific-registro.js: Erro: Formulário de registo com ID 'register-form' ou botão com ID 'register-btn' NÃO encontrados no DOM.");
    }
});
