<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Domain;

final class Address
{
    public ?string $ubigueo = null;
    public ?string $codigoPais = 'PE';
    public ?string $departamento = null;
    public ?string $provincia = null;
    public ?string $distrito = null;
    public ?string $urbanizacion = null;
    public ?string $direccion = null;
    public ?string $codLocal = '0000';

    public function __construct(
        ?string $ubigueo = null,
        ?string $codigoPais = 'PE',
        ?string $departamento = null,
        ?string $provincia = null,
        ?string $distrito = null,
        ?string $urbanizacion = null,
        ?string $direccion = null,
        ?string $codLocal = '0000'
    ) {
        $this->ubigueo = $ubigueo;
        $this->codigoPais = $codigoPais;
        $this->departamento = $departamento;
        $this->provincia = $provincia;
        $this->distrito = $distrito;
        $this->urbanizacion = $urbanizacion;
        $this->direccion = $direccion;
        $this->codLocal = $codLocal;
    }
}
