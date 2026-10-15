const token = 'c'.repeat(64);
const hold = (milliseconds) => {
  if (Cypress.expose('demoRecording')) cy.wait(milliseconds);
};

describe('≤90 second real-extension demonstration', () => {
  after(() => cy.task('fixture:close'));
  it('shows a verified clause and honest uncertainty in the actual extension', () => {
    cy.visit('/');
    cy.task('fixture:mode', 'success');
    cy.task('extension:open').then(({ reportUrl }) =>
      cy.get('#report-frame').invoke('attr', 'src', reportUrl),
    );
    cy.wait(1500);
    cy.task('extension:preview').then((text) => {
      expect(text).not.to.include('HIDDEN_ATTACK');
      expect(text).not.to.include('FORM_SECRET');
      expect(text).to.include('Visible text below the viewport');
    });
    hold(8000);
    cy.task('extension:fill', { selector: '#token', value: token });
    cy.task('extension:click', '#save-token');
    hold(3000);
    cy.task('extension:click', '#analyze');
    cy.task('extension:wait', '1 doğrulanmış madde');
    cy.task('extension:score').should('equal', '10');
    cy.task('extension:scroll', '#report');
    cy.screenshot('verified-clause');
    hold(8000);
    cy.task('extension:click', '.source-button');
    cy.task('extension:mark').should('include', 'automatically renews');
    cy.screenshot('source-quotation');
    hold(10000);
    cy.task('fixture:mode', 'mismatch');
    cy.task('extension:click', '#analyze');
    cy.task('extension:wait', 'Sonuç belirsiz');
    cy.task('extension:score').should('equal', '—');
    cy.task('extension:text').then((text) => {
      expect(text).to.include('1 aday doğrulanamadı');
      expect(text).to.include('Bu uygulama hukuki tavsiye vermez.');
      expect(text).to.include('Kontrollü test yanıtı');
      expect(text).not.to.include('always free and never charges you');
    });
    cy.screenshot('honest-uncertainty');
    hold(16000);
  });
});
