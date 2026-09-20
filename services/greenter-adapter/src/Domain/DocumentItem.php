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

    public function __construct(string $description, float $quantity, float $unitValue, float $igv, float $total, float $taxRate = 18.0)
    {
        $this->description = $description;
        $this->quantity = $quantity;
        $this->unitValue = $unitValue;
        $this->igv = $igv;
        $this->taxRate = $taxRate;
        $this->total = $total;
    }
}
