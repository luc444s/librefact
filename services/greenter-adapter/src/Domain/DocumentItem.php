<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Domain;

final class DocumentItem
{
    public string $description;
    public float $quantity;
    public float $unitValue;
    public float $igv;
    public float $total;

    public function __construct(string $description, float $quantity, float $unitValue, float $igv, float $total)
    {
        $this->description = $description;
        $this->quantity = $quantity;
        $this->unitValue = $unitValue;
        $this->igv = $igv;
        $this->total = $total;
    }
}
