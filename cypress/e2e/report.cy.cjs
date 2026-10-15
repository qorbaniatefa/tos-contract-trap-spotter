describe('Actual extension report recording', () => {
  it('captures a real page with Alibaba DOM and records the real extension report', () => {
    cy.visit('/');
    cy.task('extension:open').then(({ reportUrl }) => {
      expect(reportUrl).to.match(/^chrome-extension:\/\//);
      cy.get('#report-frame').invoke('attr', 'src', reportUrl);
    });
    cy.wait(1500);
    cy.task('extension:text').then((text) => {
      expect(text).to.include('Bu uygulama hukuki tavsiye vermez.');
      expect(text).to.include('Your subscription automatically renews');
      expect(text).not.to.include('HIDDEN_ATTACK');
      expect(text).to.include('Analiz et');
      expect(text).to.include('Servis bağlantısı');
    });
    cy.screenshot('real-extension-feasibility');
  });
});
