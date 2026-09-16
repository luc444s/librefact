<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Domain;

final class Issuer
{
    public string $ruc;
    public string $legalName;
    public ?Address $address;

    public function __construct(string $ruc, string $legalName, ?Address $address = null)
    {
        $this->ruc = $ruc;
        $this->legalName = $legalName;
        $this->address = $address;
    }
}
