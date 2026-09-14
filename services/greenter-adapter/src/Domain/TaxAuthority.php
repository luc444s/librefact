<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Domain;

final class TaxAuthority
{
    public string $country;
    public string $code;
    public string $provider;

    public function __construct(string $country, string $code, string $provider)
    {
        $this->country = $country;
        $this->code = $code;
        $this->provider = $provider;
    }
}
