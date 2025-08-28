// frontend/static/js/vincular_conta.js
// Lógica específica para a página de vinculação de conta.

import { showMessage, showLoading } from './utils.js';
import { protectPage } from './session.js';

protectPage();

document.addEventListener('DOMContentLoaded', async () => {
    showLoading(false); 
    const messageBox = document.getElementById('message-box');
    const modalBackdrop = document.getElementById('modal-backdrop');
    if (messageBox) messageBox.style.display = 'none';
    if (modalBackdrop) modalBackdrop.style.display = 'none';

    const userToken = localStorage.getItem('userToken');

    if (!userToken) {
        return; 
    }

    const linkAccountForm = document.getElementById('linkAccountForm');
    const bankSelect = document.getElementById('bankSelect');
    const accountHolderNameInput = document.getElementById('accountHolderName');
    const walletNumberInput = document.getElementById('walletNumber'); 
    const ibanNumberInput = document.getElementById('ibanNumber'); // Nota: este campo não é enviado para o backend na rota atual
    const transactionPasswordInput = document.getElementById('transactionPassword');

    async function loadLinkedAccountData() {
        showLoading(true);
        try {
            // *** O URL DO BACKEND AGORA É O NODE.JS ***
            const response = await fetch('http://localhost:5000/api/linked_account', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                }
            });
            const data = await response.json();

            if (response.ok) {
                if (data && data.bank_name) {
                    bankSelect.value = data.bank_name || '';
                    accountHolderNameInput.value = data.account_holder || ''; 
                    walletNumberInput.value = data.account_number || ''; 
                    // Se o ibanNumber do frontend se refere a um campo diferente de account_number no backend,
                    // seria necessário que o backend o retornasse. Atualmente, ele retorna 'account_number'.
                    // Por isso, este campo não será pré-preenchido automaticamente a menos que o backend retorne 'iban_number' explicitamente.
                    
                    showMessage('Sua carteira digital vinculada foi carregada. Por favor, preencha a senha de transação para atualizar ou confirmar.');
                } else {
                    showMessage('Nenhuma carteira digital vinculada encontrada. Por favor, adicione uma.', false);
                }
            } else if (response.status === 404) {
                showMessage('Nenhuma carteira digital vinculada encontrada. Por favor, adicione uma.', false);
            } else if (response.status === 401 || response.status === 403) { // 403 para token inválido/expirado
                showMessage('Sessão expirada. Por favor, faça login novamente.', true);
                setTimeout(() => { window.location.href = '/Login.html'; }, 2000);
            } else {
                showMessage('Erro ao carregar informações da carteira: ' + (data.error || data.message || 'Erro desconhecido.'), true);
            }
        } catch (error) {
            console.error('Erro ao carregar dados da conta vinculada:', error);
            showMessage('Não foi possível conectar ao servidor para carregar a carteira digital. Verifique sua conexão.', true);
        } finally {
            showLoading(false); 
        }
    }

    loadLinkedAccountData();

    if (linkAccountForm) {
        linkAccountForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            showLoading(true);

            const bankName = bankSelect.value;
            const accountHolderName = accountHolderNameInput.value;
            const walletNumber = walletNumberInput.value; 
            const ibanNumber = ibanNumberInput.value; // Não enviado atualmente ao backend
            const transactionPassword = transactionPasswordInput.value;

            if (!bankName || !accountHolderName || !walletNumber || !transactionPassword) {
                showMessage('Por favor, preencha todos os campos obrigatórios.', true);
                showLoading(false);
                return;
            }

            try {
                // *** O URL DO BACKEND AGORA É O NODE.JS ***
                const response = await fetch('http://localhost:5000/api/link-account', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`
                    },
                    body: JSON.stringify({
                        bankName: bankName,
                        accountHolder: accountHolderName, 
                        accountNumber: walletNumber, 
                        transactionPassword: transactionPassword
                    })
                });

                const data = await response.json(); 

                if (response.ok) {
                    showMessage(data.message + " Redirecionando para Saque...", false, 2000); 
                    setTimeout(() => {
                        window.location.href = '/saque.html';
                    }, 2000); 
                } else {
                    showMessage('Erro ao vincular conta: ' + (data.error || data.message || 'Erro desconhecido.'), true);
                    if (response.status === 401 || response.status === 403) {
                        setTimeout(() => { window.location.href = '/Login.html'; }, 2000);
                    }
                }
            } catch (error) {
                console.error('Erro na requisição de vincular conta:', error);
                showMessage('Não foi possível conectar ao servidor ou houve um erro inesperado. Tente novamente mais tarde.', true);
            } finally {
                showLoading(false); 
            }
        });
    } else {
        console.error('Formulário com ID "linkAccountForm" não encontrado.');
    }
});
