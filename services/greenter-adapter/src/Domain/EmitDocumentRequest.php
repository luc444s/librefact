<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Domain;

final class EmitDocumentRequest
{
    public TaxAuthority $taxAuthority;
    public DocumentIdentity $document;
    public Issuer $issuer;
    public Customer $customer;

    /** @var DocumentItem[] */
    public array $items;

    public DocumentTotals $totals;

    /**
     * @param DocumentItem[] $items
     */
    public function __construct(
        TaxAuthority $taxAuthority,
        DocumentIdentity $document,
        Issuer $issuer,
        Customer $customer,
        array $items,
        DocumentTotals $totals
    ) {
        $this->taxAuthority = $taxAuthority;
        $this->document = $document;
        $this->issuer = $issuer;
        $this->customer = $customer;
        $this->items = $items;
        $this->totals = $totals;
    }
}
