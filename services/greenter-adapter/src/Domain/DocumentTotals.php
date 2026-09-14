<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Domain;

final class DocumentTotals
{
    public float $taxable;
    public float $igv;
    public float $total;

    public function __construct(float $taxable, float $igv, float $total)
    {
        $this->taxable = $taxable;
        $this->igv = $igv;
        $this->total = $total;
    }
}
