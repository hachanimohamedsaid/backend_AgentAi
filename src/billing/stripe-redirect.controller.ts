import { Controller, Get, Header, Query } from '@nestjs/common';

@Controller('stripe')
export class StripeRedirectController {
  @Get('success')
  @Header('Content-Type', 'text/html; charset=utf-8')
  success(@Query('plan') plan?: string): string {
    const target = this.buildDeepLink('subscription/success', plan);
    return this.buildHtml(target, 'Paiement réussi, retour à l’application');
  }

  @Get('cancel')
  @Header('Content-Type', 'text/html; charset=utf-8')
  cancel(@Query('plan') plan?: string): string {
    const target = this.buildDeepLink('subscription/cancel', plan);
    return this.buildHtml(target, 'Paiement annulé, retour à l’application');
  }

  private buildDeepLink(path: string, plan?: string): string {
    const query = plan ? `?plan=${encodeURIComponent(plan)}` : '';
    return `piagent:///${path}${query}`;
  }

  private buildHtml(target: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${this.escapeHtml(title)}</title>
</head>
<body>
  <p>${this.escapeHtml(title)}...</p>
  <p>Redirection automatique vers l’application en cours.</p>
  <script>
    const target = ${JSON.stringify(target)};
    window.location.href = target;
  </script>
  <p>Si la redirection ne fonctionne pas, <a href="${this.escapeHtml(target)}">cliquez ici</a>.</p>
</body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
