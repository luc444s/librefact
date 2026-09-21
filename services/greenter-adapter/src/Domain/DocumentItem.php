<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Domain;

final class DocumentItem
{
    public string $description;
    public float $quantity;
    public float $unitValue;
    public float $igv;
    public float $taxRate;
    public float $total;
    public string $productCode;
    public string $productScheme;
    public string $unitCode;
    public string $unitScheme;
    public string $sku;

    public function __construct(
        string $description,
        float $quantity,
        float $unitValue,
        float $igv,
        float $total,
        float $taxRate = 18.0,
        string $productCode = '',
        string $productScheme = '',
        string $unitCode = '',
        string $unitScheme = '',
        string $sku = ''
    ) {
        $this->description = $description;
        $this->quantity = $quantity;
        $this->unitValue = $unitValue;
        $this->igv = $igv;
        $this->taxRate = $taxRate;
        $this->total = $total;
        $this->productCode = $productCode;
        $this->productScheme = $productScheme;
        $this->unitCode = $unitCode;
        $this->unitScheme = $unitScheme;
        $this->sku = $sku;
    }
}
