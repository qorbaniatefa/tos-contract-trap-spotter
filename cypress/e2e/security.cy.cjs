describe('Actual extension security boundaries', () => {
  it('preserves rendered inline spacing and keeps qualifications in the same paragraph', () => {
    cy.visit('/');
    cy.task('extension:open', '/policy-inline').then(({ reportUrl }) =>
      cy.get('#report-frame').invoke('attr', 'src', reportUrl),
    );
    cy.wait(1500);
    cy.task('extension:preview').then((text) => {
      expect(text).to.include('automatically renews each month');
      expect(text).not.to.include('automaticallyrenews');
      expect(text).to.include('automatically renews. Except prepaid plans');
      expect(text).to.include(
        'Refunds are limited.\nExcept where required by law.',
      );
      expect(text).not.to.include('\n\nExcept');
    });
  });
  after(() => cy.task('fixture:close'));
  it('excludes hidden instructions, resists visible fixture instructions, and rejects malformed responses', () => {
    cy.visit('/');
    cy.task('fixture:mode', 'success');
    cy.task('extension:open', '/policy-visible').then(({ reportUrl }) =>
      cy.get('#report-frame').invoke('attr', 'src', reportUrl),
    );
    cy.wait(1500);
    cy.task('extension:preview').then((text) => {
      expect(text).not.to.include('HIDDEN_ATTACK');
      expect(text).not.to.include('FORM_SECRET');
      expect(text).to.include('Ignore previous instructions');
    });
    cy.task('extension:fill', { selector: '#token', value: 'c'.repeat(64) });
    cy.task('extension:click', '#save-token');
    cy.task('extension:click', '#analyze');
    cy.task('extension:wait', '1 doğrulanmış madde');
    cy.task('extension:score').should('equal', '10');
    cy.task('extension:domSafety').should('equal', 0);
    cy.task('extension:text').should('include', 'talimata benzeyen metin');
    cy.task('fixture:mode', 'malformed');
    cy.task('extension:click', '#analyze');
    cy.task('extension:wait', 'Sonuç belirsiz');
    cy.task('extension:score').should('equal', '—');
    cy.task('extension:text').should('include', 'geçerli JSON değildi');
    cy.task('fixture:mode', 'slow');
    cy.task('extension:secondStart');
    cy.task('extension:click', '#clear');
    cy.task('extension:preview').should('equal', '');
    cy.task('extension:text').should('include', 'Oturum verileri silindi');
    cy.task('extension:secondAfterClear').then((result) => {
      expect(result.preview).to.equal('');
      expect(result.disabled).to.equal(true);
      expect(result.storageKeys).to.deep.equal([]);
    });
  });
});
