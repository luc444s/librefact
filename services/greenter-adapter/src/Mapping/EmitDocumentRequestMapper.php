<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Mapping;

use Librefact\GreenterAdapter\Domain\Customer;
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
                (string) $payload['issuer']['legal_name']
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
                    (float) $item['total']
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
}
