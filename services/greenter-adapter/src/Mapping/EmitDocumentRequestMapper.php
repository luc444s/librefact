<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Mapping;

use Librefact\GreenterAdapter\Domain\Customer;
use Librefact\GreenterAdapter\Domain\Address;
use Librefact\GreenterAdapter\Domain\DocumentIdentity;
use Librefact\GreenterAdapter\Domain\DocumentItem;
use Librefact\GreenterAdapter\Domain\DocumentTotals;
use Librefact\GreenterAdapter\Domain\EmitDocumentRequest;
use Librefact\GreenterAdapter\Domain\Issuer;
use Librefact\GreenterAdapter\Domain\TaxAuthority;

final class EmitDocumentRequestMapper
{
    /**
     * @param array<string, mixed> $payload
     */
    public function fromPayload(array $payload): EmitDocumentRequest
    {
        return new EmitDocumentRequest(
            new TaxAuthority(
                (string) $payload['tax_authority']['country'],
                (string) $payload['tax_authority']['code'],
                (string) $payload['tax_authority']['provider']
            ),
            new DocumentIdentity(
                (string) $payload['document']['type'],
                (string) $payload['document']['serie'],
                (int) $payload['document']['number'],
                (string) $payload['document']['currency'],
                (string) $payload['document']['issue_date']
            ),
            new Issuer(
                (string) $payload['issuer']['ruc'],
                (string) $payload['issuer']['legal_name'],
                $this->addressFromPayload($payload['issuer']['address'] ?? null)
            ),
            new Customer(
                (string) $payload['customer']['document_type'],
                (string) $payload['customer']['document_number'],
                (string) $payload['customer']['legal_name']
            ),
            array_map(
                static fn (array $item): DocumentItem => new DocumentItem(
                    (string) $item['description'],
                    (float) $item['quantity'],
                    (float) $item['unit_value'],
                    (float) $item['igv'],
                    (float) $item['total'],
                    (float) ($item['tax_rate'] ?? 18.0),
                    isset($item['product_code']) ? (string) $item['product_code'] : '',
                    isset($item['product_scheme']) ? (string) $item['product_scheme'] : '',
                    isset($item['unit_code']) ? (string) $item['unit_code'] : '',
                    isset($item['unit_scheme']) ? (string) $item['unit_scheme'] : '',
                    isset($item['sku']) ? (string) $item['sku'] : ''
                ),
                $payload['items']
            ),
            new DocumentTotals(
                (float) $payload['totals']['taxable'],
                (float) $payload['totals']['igv'],
                (float) $payload['totals']['total']
            )
        );
    }

    /**
     * @param mixed $payload
     */
    private function addressFromPayload($payload): Address
    {
        if (!is_array($payload)) {
            return new Address(codLocal: '0000');
        }

        return new Address(
            isset($payload['ubigueo']) ? (string) $payload['ubigueo'] : null,
            isset($payload['codigo_pais']) ? (string) $payload['codigo_pais'] : 'PE',
            isset($payload['departamento']) ? (string) $payload['departamento'] : null,
            isset($payload['provincia']) ? (string) $payload['provincia'] : null,
            isset($payload['distrito']) ? (string) $payload['distrito'] : null,
            isset($payload['urbanizacion']) ? (string) $payload['urbanizacion'] : null,
            isset($payload['direccion']) ? (string) $payload['direccion'] : null,
            isset($payload['cod_local']) ? (string) $payload['cod_local'] : '0000'
        );
    }
}
