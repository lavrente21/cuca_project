// static/js/vincular_conta.js
// Este script contém toda a lógica para a página de vinculação de conta,
// incluindo funções para exibir mensagens e o indicador de carregamento,
// e o tratamento da submissão do formulário.

// Importa as funções showMessage e showLoading do ficheiro utils.js
import { showMessage, showLoading } from './utils.js';
// Importa a função protectPage do ficheiro session.js para proteção da página
import { protectPage } from './session.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Protege esta página - só pode ser acedida se estiver logado.
    // Esta chamada é crucial e deve ser uma das primeiras coisas a acontecer.
    protectPage();

    // Esconde o carregamento e as mensagens ao carregar a página para garantir o estado inicial limpo
    showLoading(false); 
    const messageBox = document.getElementById('message-box');
    const modalBackdrop = document.getElementById('modal-backdrop');
    if (messageBox) messageBox.style.display = 'none';
    if (modalBackdrop) modalBackdrop.style.display = 'none';

    const userToken = localStorage.getItem('userToken');

    // Esta verificação adicional (`if (!userToken)`) é uma segurança caso `protectPage()`
    // por algum motivo falhe em redirecionar imediatamente, parando a execução deste script.
    if (!userToken) {
        return; 
    }

    // Obter referências aos elementos do formulário e outros elementos relevantes do HTML
    const linkAccountForm = document.getElementById('linkAccountForm');
    const bankSelect = document.getElementById('bankSelect');
    const accountHolderNameInput = document.getElementById('accountHolderName');
    const walletNumberInput = document.getElementById('walletNumber'); // Corresponde ao "Número IBAN" no HTML
    const ibanNumberInput = document.getElementById('ibanNumber'); // "Número da carteira digital(Opcional)" no HTML
    const transactionPasswordInput = document.getElementById('transactionPassword');

    // ==========================================================
    // Função para carregar dados da conta vinculada existente
    // Isso ajuda a pré-preencher o formulário se já houver uma conta vinculada
    // ==========================================================
    async function loadLinkedAccountData() {
        showLoading(true); // Mostra o indicador de carregamento
        try {
            // Endpoint para buscar a conta vinculada (já corrigido para /api/linked_account)
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
                    // Preenche os campos do formulário com os dados recebidos do backend
                    bankSelect.value = data.bank_name || '';
                    // O backend retorna 'account_holder', não 'account_holder_name'
                    accountHolderNameInput.value = data.account_holder || ''; 
                    // O backend retorna 'account_number' para o campo principal (IBAN/Conta)
                    walletNumberInput.value = data.account_number || ''; 
                    // O campo 'ibanNumber' do frontend não é explicitamente mapeado no backend para uma coluna separada.
                    // Para este contexto, não o pré-preencheremos se não for retornado.
                    // Se precisar que este campo seja persistente, é necessário adicionar uma coluna no MySQL e ajustar o backend.
                    
                    showMessage('Sua carteira digital vinculada foi carregada. Por favor, preencha a senha de transação para atualizar ou confirmar.');
                } else {
                    showMessage('Nenhuma carteira digital vinculada encontrada. Por favor, adicione uma.', false);
                }
            } else if (response.status === 404) {
                // Caso o backend retorne 404, significa que não há conta vinculada
                showMessage('Nenhuma carteira digital vinculada encontrada. Por favor, adicione uma.', false);
            } else if (response.status === 401) {
                // Se a sessão expirou ou o token é inválido
                showMessage('Sessão expirada. Por favor, faça login novamente.', true);
                setTimeout(() => { window.location.href = '/Login.html'; }, 2000);
            } else {
                // Captura outros erros do servidor
                showMessage('Erro ao carregar informações da carteira: ' + (data.error || data.message || 'Erro desconhecido.'), true);
            }
        } catch (error) {
            console.error('Erro ao carregar dados da conta vinculada:', error);
            showMessage('Não foi possível conectar ao servidor para carregar a carteira digital. Verifique sua conexão.', true);
        } finally {
            showLoading(false); 
        }
    }

    // Chama a função para carregar dados ao carregar a página
    loadLinkedAccountData();

    // ==========================================================
    // Lógica para enviar o formulário de vincular conta
    // ==========================================================
    if (linkAccountForm) {
        linkAccountForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Impede o envio padrão do formulário (recarregamento da página)

            showLoading(true); 

            // Obtém os valores atuais dos campos do formulário
            const bankName = bankSelect.value;
            const accountHolderName = accountHolderNameInput.value;
            const walletNumber = walletNumberInput.value; // Valor do "Número IBAN" do HTML
            const ibanNumber = ibanNumberInput.value; // Valor do "Número da carteira digital" do HTML
            const transactionPassword = transactionPasswordInput.value;

            // Validação básica dos campos obrigatórios do lado do cliente
            if (!bankName || !accountHolderName || !walletNumber || !transactionPassword) {
                showMessage('Por favor, preencha todos os campos obrigatórios.', true);
                showLoading(false);
                return;
            }

            try {
                // Endpoint para enviar os dados da conta vinculada (já corrigido para /api/link-account)
                const response = await fetch('http://localhost:5000/api/link-account', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}` 
                    },
                    body: JSON.stringify({
                        bankName: bankName,
                        accountHolder: accountHolderName, // Backend espera 'accountHolder'
                        accountNumber: walletNumber,       // Backend espera 'accountNumber'
                        // O campo 'ibanNumber' do frontend (Número da carteira digital opcional) não está
                        // atualmente mapeado para uma coluna separada no backend. Se for essencial,
                        // uma nova coluna na tabela 'users' e lógica de backend precisariam ser adicionadas.
                        // transactionPassword é enviado.
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
                    if (response.status === 401) {
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
